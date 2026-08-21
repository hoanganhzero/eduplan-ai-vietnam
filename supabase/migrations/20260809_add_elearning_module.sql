create table if not exists eduplan_private.elearning_lessons (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references eduplan_private.accounts(id) on delete cascade,
  title text not null,
  subject text not null,
  grade text not null default '10',
  class_name text not null default 'Tất cả học sinh',
  summary text,
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 240),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  cover_color text not null default '#155eef',
  objectives jsonb not null default '[]'::jsonb check (jsonb_typeof(objectives) = 'array'),
  sections jsonb not null default '[]'::jsonb check (jsonb_typeof(sections) = 'array'),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists elearning_lessons_teacher_idx
  on eduplan_private.elearning_lessons(teacher_id, updated_at desc);
create index if not exists elearning_lessons_published_idx
  on eduplan_private.elearning_lessons(status, published_at desc);

create table if not exists eduplan_private.elearning_progress (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references eduplan_private.elearning_lessons(id) on delete cascade,
  student_id uuid not null references eduplan_private.accounts(id) on delete cascade,
  current_section integer not null default 0,
  completed_sections jsonb not null default '[]'::jsonb check (jsonb_typeof(completed_sections) = 'array'),
  answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
  score numeric(5,2),
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(lesson_id, student_id)
);

create index if not exists elearning_progress_student_idx
  on eduplan_private.elearning_progress(student_id, updated_at desc);
create index if not exists elearning_progress_lesson_idx
  on eduplan_private.elearning_progress(lesson_id, status);

alter table eduplan_private.elearning_lessons enable row level security;
alter table eduplan_private.elearning_progress enable row level security;
revoke all on eduplan_private.elearning_lessons, eduplan_private.elearning_progress from public, anon, authenticated;

create or replace function eduplan_private.lesson_json(
  l eduplan_private.elearning_lessons,
  p eduplan_private.elearning_progress default null
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'id', l.id::text,
    'teacherId', l.teacher_id::text,
    'teacherName', (select a.name from eduplan_private.accounts a where a.id = l.teacher_id),
    'title', l.title,
    'subject', l.subject,
    'grade', l.grade,
    'className', l.class_name,
    'summary', l.summary,
    'durationMinutes', l.duration_minutes,
    'status', l.status,
    'coverColor', l.cover_color,
    'objectives', l.objectives,
    'sections', l.sections,
    'publishedAt', l.published_at,
    'createdAt', l.created_at,
    'updatedAt', l.updated_at,
    'progress', case when p.id is null then null else jsonb_build_object(
      'currentSection', p.current_section,
      'completedSections', p.completed_sections,
      'answers', p.answers,
      'score', p.score,
      'status', p.status,
      'startedAt', p.started_at,
      'completedAt', p.completed_at,
      'updatedAt', p.updated_at
    ) end,
    'stats', jsonb_build_object(
      'learners', (select count(*) from eduplan_private.elearning_progress ep where ep.lesson_id = l.id),
      'completed', (select count(*) from eduplan_private.elearning_progress ep where ep.lesson_id = l.id and ep.status = 'completed'),
      'averageScore', (select round(avg(ep.score), 1) from eduplan_private.elearning_progress ep where ep.lesson_id = l.id and ep.score is not null)
    )
  )
$$;

create or replace function public.eduplan_learning(
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
  v_lesson eduplan_private.elearning_lessons;
  v_progress eduplan_private.elearning_progress;
  v_source eduplan_private.elearning_lessons;
  v_token text := coalesce(p_payload->>'token', '');
  v_lesson_id uuid;
  v_data jsonb := coalesce(p_payload->'lesson', '{}'::jsonb);
  v_sections jsonb;
  v_objectives jsonb;
  v_answers jsonb;
  v_completed jsonb;
  v_total numeric := 0;
  v_earned numeric := 0;
  v_score numeric := null;
  v_finish boolean := coalesce((p_payload->>'finish')::boolean, false);
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

  if p_action = 'list' then
    if v_actor.role in ('teacher', 'admin') then
      return jsonb_build_object(
        'lessons', coalesce((
          select jsonb_agg(eduplan_private.lesson_json(l, null::eduplan_private.elearning_progress) order by l.updated_at desc)
          from eduplan_private.elearning_lessons l
          where v_actor.role = 'admin' or l.teacher_id = v_actor.id
        ), '[]'::jsonb)
      );
    elsif v_actor.role = 'student' then
      return jsonb_build_object(
        'lessons', coalesce((
          select jsonb_agg(eduplan_private.lesson_json(l, p) order by l.published_at desc)
          from eduplan_private.elearning_lessons l
          left join eduplan_private.elearning_progress p
            on p.lesson_id = l.id and p.student_id = v_actor.id
          where l.status = 'published'
        ), '[]'::jsonb)
      );
    end if;
    return jsonb_build_object('lessons', '[]'::jsonb);
  end if;

  if nullif(p_payload->>'id', '') is not null then
    v_lesson_id := (p_payload->>'id')::uuid;
  end if;

  if p_action = 'get' then
    select * into v_lesson from eduplan_private.elearning_lessons where id = v_lesson_id;
    if v_lesson.id is null then raise exception 'Không tìm thấy bài học'; end if;
    if v_lesson.status <> 'published' and v_actor.role <> 'admin' and v_lesson.teacher_id <> v_actor.id then
      raise exception 'Bạn không có quyền mở bài học này';
    end if;
    if v_actor.role = 'student' then
      select * into v_progress from eduplan_private.elearning_progress
      where lesson_id = v_lesson.id and student_id = v_actor.id;
    end if;
    return jsonb_build_object('lesson', eduplan_private.lesson_json(v_lesson, v_progress));
  end if;

  if p_action = 'save_progress' then
    if v_actor.role <> 'student' then raise exception 'Chỉ học sinh được lưu tiến độ học'; end if;
    select * into v_lesson from eduplan_private.elearning_lessons where id = v_lesson_id and status = 'published';
    if v_lesson.id is null then raise exception 'Bài học chưa được xuất bản'; end if;
    v_answers := coalesce(p_payload->'answers', '{}'::jsonb);
    v_completed := coalesce(p_payload->'completedSections', '[]'::jsonb);
    if jsonb_typeof(v_answers) <> 'object' or jsonb_typeof(v_completed) <> 'array' then raise exception 'Dữ liệu tiến độ không hợp lệ'; end if;

    select
      coalesce(sum(coalesce(nullif(s->>'points', '')::numeric, 1)), 0),
      coalesce(sum(case
        when lower(trim(coalesce(v_answers->>(s->>'id'), ''))) = lower(trim(coalesce(s->>'correctAnswer', '')))
        then coalesce(nullif(s->>'points', '')::numeric, 1) else 0 end), 0)
    into v_total, v_earned
    from jsonb_array_elements(v_lesson.sections) s
    where s->>'type' = 'quiz' and nullif(s->>'correctAnswer', '') is not null;
    if v_total > 0 then v_score := round(v_earned * 100 / v_total, 2); end if;

    insert into eduplan_private.elearning_progress(
      lesson_id, student_id, current_section, completed_sections, answers,
      score, status, completed_at, updated_at
    ) values (
      v_lesson.id, v_actor.id,
      greatest(0, least(coalesce((p_payload->>'currentSection')::integer, 0), jsonb_array_length(v_lesson.sections) - 1)),
      v_completed, v_answers, v_score,
      case when v_finish then 'completed' else 'in_progress' end,
      case when v_finish then now() else null end,
      now()
    )
    on conflict(lesson_id, student_id) do update set
      current_section = excluded.current_section,
      completed_sections = excluded.completed_sections,
      answers = excluded.answers,
      score = excluded.score,
      status = case when eduplan_private.elearning_progress.status = 'completed' then 'completed' else excluded.status end,
      completed_at = case
        when eduplan_private.elearning_progress.completed_at is not null then eduplan_private.elearning_progress.completed_at
        else excluded.completed_at end,
      updated_at = now()
    returning * into v_progress;
    return jsonb_build_object('lesson', eduplan_private.lesson_json(v_lesson, v_progress), 'progress', eduplan_private.lesson_json(v_lesson, v_progress)->'progress');
  end if;

  if v_actor.role not in ('teacher', 'admin') then
    raise exception 'Chỉ giáo viên được quản lý bài học eLearning';
  end if;

  if p_action = 'save' then
    v_sections := coalesce(v_data->'sections', '[]'::jsonb);
    v_objectives := coalesce(v_data->'objectives', '[]'::jsonb);
    if trim(coalesce(v_data->>'title', '')) = '' or trim(coalesce(v_data->>'subject', '')) = '' then
      raise exception 'Vui lòng nhập tên bài học và môn học';
    end if;
    if jsonb_typeof(v_sections) <> 'array' or jsonb_array_length(v_sections) = 0 then
      raise exception 'Bài học cần ít nhất một nội dung';
    end if;
    if jsonb_array_length(v_sections) > 40 then raise exception 'Bài học tối đa 40 hoạt động'; end if;
    if jsonb_typeof(v_objectives) <> 'array' then raise exception 'Mục tiêu bài học không hợp lệ'; end if;

    if v_lesson_id is null then
      insert into eduplan_private.elearning_lessons(
        teacher_id, title, subject, grade, class_name, summary,
        duration_minutes, cover_color, objectives, sections
      ) values (
        v_actor.id,
        trim(v_data->>'title'), trim(v_data->>'subject'), coalesce(nullif(v_data->>'grade', ''), '10'),
        coalesce(nullif(v_data->>'className', ''), 'Tất cả học sinh'), nullif(trim(coalesce(v_data->>'summary', '')), ''),
        greatest(5, least(coalesce((v_data->>'durationMinutes')::integer, 30), 240)),
        coalesce(nullif(v_data->>'coverColor', ''), '#155eef'), v_objectives, v_sections
      ) returning * into v_lesson;
    else
      update eduplan_private.elearning_lessons set
        title = trim(v_data->>'title'), subject = trim(v_data->>'subject'),
        grade = coalesce(nullif(v_data->>'grade', ''), grade),
        class_name = coalesce(nullif(v_data->>'className', ''), class_name),
        summary = nullif(trim(coalesce(v_data->>'summary', '')), ''),
        duration_minutes = greatest(5, least(coalesce((v_data->>'durationMinutes')::integer, duration_minutes), 240)),
        cover_color = coalesce(nullif(v_data->>'coverColor', ''), cover_color),
        objectives = v_objectives, sections = v_sections, updated_at = now()
      where id = v_lesson_id and (teacher_id = v_actor.id or v_actor.role = 'admin')
      returning * into v_lesson;
      if v_lesson.id is null then raise exception 'Không tìm thấy hoặc không có quyền sửa bài học'; end if;
    end if;
    return jsonb_build_object('lesson', eduplan_private.lesson_json(v_lesson, null::eduplan_private.elearning_progress));
  end if;

  select * into v_lesson from eduplan_private.elearning_lessons
  where id = v_lesson_id and (teacher_id = v_actor.id or v_actor.role = 'admin');
  if v_lesson.id is null then raise exception 'Không tìm thấy hoặc không có quyền quản lý bài học'; end if;

  if p_action = 'publish' then
    if jsonb_array_length(v_lesson.sections) = 0 then raise exception 'Bài học chưa có nội dung'; end if;
    update eduplan_private.elearning_lessons set
      status = 'published', published_at = coalesce(published_at, now()), updated_at = now()
    where id = v_lesson.id returning * into v_lesson;
    return jsonb_build_object('lesson', eduplan_private.lesson_json(v_lesson, null::eduplan_private.elearning_progress), 'message', 'Đã xuất bản cho học sinh');
  elsif p_action = 'unpublish' then
    update eduplan_private.elearning_lessons set status = 'draft', updated_at = now()
    where id = v_lesson.id returning * into v_lesson;
    return jsonb_build_object('lesson', eduplan_private.lesson_json(v_lesson, null::eduplan_private.elearning_progress), 'message', 'Đã chuyển về bản nháp');
  elsif p_action = 'duplicate' then
    v_source := v_lesson;
    insert into eduplan_private.elearning_lessons(
      teacher_id, title, subject, grade, class_name, summary,
      duration_minutes, status, cover_color, objectives, sections
    ) values (
      v_actor.id, v_source.title || ' — Bản sao', v_source.subject, v_source.grade,
      v_source.class_name, v_source.summary, v_source.duration_minutes, 'draft',
      v_source.cover_color, v_source.objectives, v_source.sections
    ) returning * into v_lesson;
    return jsonb_build_object('lesson', eduplan_private.lesson_json(v_lesson, null::eduplan_private.elearning_progress));
  elsif p_action = 'delete' then
    delete from eduplan_private.elearning_lessons where id = v_lesson.id;
    return jsonb_build_object('deleted', true);
  end if;

  raise exception 'Thao tác eLearning không được hỗ trợ';
exception
  when invalid_text_representation then raise exception 'Mã bài học hoặc dữ liệu chưa hợp lệ';
end
$$;

revoke all on function public.eduplan_learning(text, text, jsonb) from public;
grant execute on function public.eduplan_learning(text, text, jsonb) to anon;
