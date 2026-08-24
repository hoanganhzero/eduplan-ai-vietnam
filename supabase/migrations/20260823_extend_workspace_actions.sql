-- Mở rộng eduplan_workspace: học sinh tham gia lớp bằng mã, nhắn tin
-- phụ huynh/giáo viên, đánh dấu đã đọc thông báo và nộp bài kiểm tra
-- trực tuyến. Giữ nguyên các hành vi get/save/submit hiện có.
create or replace function public.eduplan_workspace(
  p_secret text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor eduplan_private.accounts;
  v_target eduplan_private.accounts;
  v_token text := coalesce(p_payload->>'token', '');
  v_data jsonb;
  v_next jsonb;
  v_records jsonb;
  v_submission jsonb;
  v_assignment_id text;
  v_code text;
  v_class jsonb;
  v_classes jsonb;
  v_members jsonb;
  v_body text;
  v_messages jsonb;
  v_message jsonb;
  v_notifications jsonb;
  v_assessment jsonb;
  v_results jsonb;
  v_result jsonb;
begin
  if not eduplan_private.valid_app_secret(p_secret) then
    raise exception 'Khóa máy chủ không hợp lệ';
  end if;

  delete from eduplan_private.sessions where expires_at <= now();
  select a.* into v_actor
  from eduplan_private.sessions s
  join eduplan_private.accounts a on a.id = s.account_id
  where s.token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex')
    and s.expires_at > now()
  limit 1;
  if v_actor.id is null then raise exception 'Cần đăng nhập'; end if;
  if v_actor.status <> 'active' then raise exception 'Tài khoản chưa được kích hoạt'; end if;

  select data into v_data from eduplan_private.workspace_state where id = 'main' for update;
  if v_data is null then
    v_data := '{"users":[],"classes":[],"assignments":[],"assessments":[],"submissionRecords":[],"notifications":[],"settings":{"openai":false,"zalo":false,"autoNotify":false,"maintenance":false},"submissions":0,"attendance":0}'::jsonb;
  end if;

  if p_action = 'get' then
    return jsonb_build_object('data', v_data, 'updatedAt', (select updated_at from eduplan_private.workspace_state where id = 'main'));
  end if;

  if p_action = 'save' then
    if v_actor.role not in ('teacher', 'admin') then
      raise exception 'Chỉ giáo viên hoặc quản trị viên được thay đổi lớp và bài tập';
    end if;
    v_next := coalesce(p_payload->'data', '{}'::jsonb);
    if jsonb_typeof(v_next) <> 'object' then raise exception 'Dữ liệu không hợp lệ'; end if;
    if pg_column_size(v_next) > 800000 then raise exception 'Dữ liệu vượt quá giới hạn'; end if;
    update eduplan_private.workspace_state
      set data = v_next, updated_by = v_actor.id, updated_at = now()
      where id = 'main';
    return jsonb_build_object('saved', true, 'data', v_next, 'updatedAt', now());
  end if;

  if p_action = 'submit' then
    if v_actor.role <> 'student' then raise exception 'Chỉ học sinh được nộp bài'; end if;
    v_submission := coalesce(p_payload->'submission', '{}'::jsonb);
    v_assignment_id := nullif(v_submission->>'assignmentId', '');
    if v_assignment_id is null then raise exception 'Vui lòng chọn bài tập cần nộp'; end if;
    if not exists (
      select 1 from jsonb_array_elements(coalesce(v_data->'assignments', '[]'::jsonb)) a
      where a->>'id' = v_assignment_id
    ) then raise exception 'Bài tập không tồn tại hoặc đã bị thu hồi'; end if;
    if trim(regexp_replace(coalesce(v_submission->>'contentHtml', ''), '<[^>]*>', '', 'g')) = ''
      and jsonb_array_length(coalesce(v_submission->'attachments', '[]'::jsonb)) = 0 then
      raise exception 'Bài nộp cần có nội dung hoặc tệp đính kèm';
    end if;

    select coalesce(jsonb_agg(item), '[]'::jsonb) into v_records
    from jsonb_array_elements(coalesce(v_data->'submissionRecords', '[]'::jsonb)) item
    where not (item->>'assignmentId' = v_assignment_id and item->>'studentKey' = v_actor.id::text);
    v_submission := v_submission || jsonb_build_object(
      'id', coalesce(nullif(v_submission->>'id', ''), floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text),
      'studentKey', v_actor.id::text,
      'studentName', v_actor.name,
      'status', 'Đã nộp',
      'submittedAt', now()
    );
    v_records := v_records || jsonb_build_array(v_submission);
    v_data := jsonb_set(v_data, '{submissionRecords}', v_records, true);
    v_data := jsonb_set(v_data, '{submissions}', to_jsonb(jsonb_array_length(v_records)), true);
    update eduplan_private.workspace_state
      set data = v_data, updated_by = v_actor.id, updated_at = now()
      where id = 'main';
    return jsonb_build_object('saved', true, 'submission', v_submission, 'data', v_data, 'updatedAt', now());
  end if;

  -- Học sinh tham gia lớp bằng mã do giáo viên cung cấp.
  if p_action = 'join_class' then
    if v_actor.role <> 'student' then raise exception 'Chỉ học sinh được tham gia lớp bằng mã'; end if;
    v_code := upper(trim(coalesce(p_payload->>'code', '')));
    if v_code = '' then raise exception 'Vui lòng nhập mã lớp'; end if;
    select item into v_class
    from jsonb_array_elements(coalesce(v_data->'classes', '[]'::jsonb)) item
    where upper(coalesce(item->>'code', '')) = v_code
    limit 1;
    if v_class is null then raise exception 'Mã lớp không đúng hoặc lớp đã bị xóa'; end if;
    v_members := coalesce(v_class->'members', '[]'::jsonb);
    if exists (
      select 1 from jsonb_array_elements(v_members) m
      where m->>'key' = v_actor.id::text
    ) then
      return jsonb_build_object('saved', true, 'alreadyJoined', true, 'data', v_data, 'className', v_class->>'name');
    end if;
    v_members := v_members || jsonb_build_array(jsonb_build_object(
      'key', v_actor.id::text, 'name', v_actor.name, 'joinedAt', now()
    ));
    select coalesce(jsonb_agg(
      case when upper(coalesce(item->>'code', '')) = v_code
        then item || jsonb_build_object('members', v_members, 'students', jsonb_array_length(v_members))
        else item end
    ), '[]'::jsonb) into v_classes
    from jsonb_array_elements(coalesce(v_data->'classes', '[]'::jsonb)) item;
    v_data := jsonb_set(v_data, '{classes}', v_classes, true);
    update eduplan_private.workspace_state
      set data = v_data, updated_by = v_actor.id, updated_at = now()
      where id = 'main';
    return jsonb_build_object('saved', true, 'data', v_data, 'className', v_class->>'name');
  end if;

  -- Nhắn tin giữa phụ huynh, giáo viên và quản trị viên.
  if p_action = 'send_message' then
    if v_actor.role not in ('parent', 'teacher', 'admin') then
      raise exception 'Tài khoản này chưa được dùng kênh trao đổi';
    end if;
    v_body := trim(coalesce(p_payload->>'body', ''));
    if v_body = '' then raise exception 'Vui lòng nhập nội dung tin nhắn'; end if;
    if length(v_body) > 2000 then raise exception 'Tin nhắn tối đa 2000 ký tự'; end if;
    select a.* into v_target from eduplan_private.accounts a
    where a.id::text = coalesce(p_payload->>'toKey', '') limit 1;
    if v_target.id is null then raise exception 'Không tìm thấy người nhận'; end if;
    v_message := jsonb_build_object(
      'id', floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text,
      'fromKey', v_actor.id::text, 'fromName', v_actor.name, 'fromRole', v_actor.role,
      'toKey', v_target.id::text, 'toName', v_target.name,
      'body', v_body, 'time', now(), 'readBy', jsonb_build_array(v_actor.id::text)
    );
    v_messages := coalesce(v_data->'messages', '[]'::jsonb) || jsonb_build_array(v_message);
    -- Giữ tối đa 500 tin gần nhất để không vượt giới hạn dung lượng.
    if jsonb_array_length(v_messages) > 500 then
      select coalesce(jsonb_agg(t.item order by t.position), '[]'::jsonb) into v_messages
      from jsonb_array_elements(v_messages) with ordinality as t(item, position)
      where t.position > jsonb_array_length(v_messages) - 500;
    end if;
    v_data := jsonb_set(v_data, '{messages}', v_messages, true);
    update eduplan_private.workspace_state
      set data = v_data, updated_by = v_actor.id, updated_at = now()
      where id = 'main';
    return jsonb_build_object('saved', true, 'message', v_message, 'data', v_data);
  end if;

  -- Đánh dấu tất cả thông báo là đã đọc đối với tài khoản hiện tại.
  if p_action = 'read_notifications' then
    select coalesce(jsonb_agg(
      case when coalesce(item->'readBy', '[]'::jsonb) @> to_jsonb(array[v_actor.id::text])
        then item
        else item || jsonb_build_object('readBy', coalesce(item->'readBy', '[]'::jsonb) || jsonb_build_array(v_actor.id::text))
      end
    ), '[]'::jsonb) into v_notifications
    from jsonb_array_elements(coalesce(v_data->'notifications', '[]'::jsonb)) item;
    v_data := jsonb_set(v_data, '{notifications}', v_notifications, true);
    update eduplan_private.workspace_state
      set data = v_data, updated_by = v_actor.id, updated_at = now()
      where id = 'main';
    return jsonb_build_object('saved', true, 'data', v_data);
  end if;

  -- Học sinh nộp bài luyện tập / kiểm tra trực tuyến đã xuất bản.
  if p_action = 'submit_assessment' then
    if v_actor.role <> 'student' then raise exception 'Chỉ học sinh được nộp bài kiểm tra'; end if;
    v_result := coalesce(p_payload->'result', '{}'::jsonb);
    v_assignment_id := nullif(v_result->>'assessmentId', '');
    if v_assignment_id is null then raise exception 'Thiếu mã bài kiểm tra'; end if;
    select item into v_assessment
    from jsonb_array_elements(coalesce(v_data->'assessments', '[]'::jsonb)) item
    where item->>'id' = v_assignment_id limit 1;
    if v_assessment is null then raise exception 'Bài kiểm tra không tồn tại'; end if;
    if coalesce(v_assessment->>'status', '') <> 'Đã xuất bản' then
      raise exception 'Bài kiểm tra chưa được xuất bản';
    end if;
    select coalesce(jsonb_agg(item), '[]'::jsonb) into v_results
    from jsonb_array_elements(coalesce(v_data->'assessmentResults', '[]'::jsonb)) item
    where not (item->>'assessmentId' = v_assignment_id and item->>'studentKey' = v_actor.id::text);
    v_result := v_result || jsonb_build_object(
      'id', floor(extract(epoch from clock_timestamp()) * 1000)::bigint::text,
      'studentKey', v_actor.id::text,
      'studentName', v_actor.name,
      'submittedAt', now()
    );
    v_results := v_results || jsonb_build_array(v_result);
    v_data := jsonb_set(v_data, '{assessmentResults}', v_results, true);
    update eduplan_private.workspace_state
      set data = v_data, updated_by = v_actor.id, updated_at = now()
      where id = 'main';
    return jsonb_build_object('saved', true, 'result', v_result, 'data', v_data);
  end if;

  raise exception 'Thao tác dữ liệu không được hỗ trợ';
end
$$;

revoke all on function public.eduplan_workspace(text, text, jsonb) from public;
grant execute on function public.eduplan_workspace(text, text, jsonb) to anon;
