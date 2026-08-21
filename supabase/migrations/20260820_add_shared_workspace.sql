create table if not exists eduplan_private.workspace_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_by uuid references eduplan_private.accounts(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table eduplan_private.workspace_state enable row level security;
revoke all on eduplan_private.workspace_state from public, anon, authenticated;

insert into eduplan_private.workspace_state(id, data)
values (
  'main',
  '{"users":[],"classes":[],"assignments":[],"assessments":[],"submissionRecords":[],"notifications":[],"settings":{"openai":false,"zalo":false,"autoNotify":false,"maintenance":false},"submissions":0,"attendance":0}'::jsonb
)
on conflict (id) do nothing;

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
  v_token text := coalesce(p_payload->>'token', '');
  v_data jsonb;
  v_next jsonb;
  v_records jsonb;
  v_submission jsonb;
  v_assignment_id text;
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

  raise exception 'Thao tác dữ liệu không được hỗ trợ';
end
$$;

revoke all on function public.eduplan_workspace(text, text, jsonb) from public;
grant execute on function public.eduplan_workspace(text, text, jsonb) to anon;
