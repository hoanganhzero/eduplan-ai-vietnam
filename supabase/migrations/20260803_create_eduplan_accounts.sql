create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists eduplan_private;
revoke all on schema eduplan_private from public, anon, authenticated;

create table eduplan_private.accounts (
  id uuid primary key default gen_random_uuid(),
  email extensions.citext unique,
  username extensions.citext not null unique,
  name text not null,
  role text not null check (role in ('admin','teacher','student','parent')),
  status text not null default 'active' check (status in ('active','pending','locked')),
  password_hash text,
  avatar_key text unique,
  phone text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_format check (email is null or email::text ~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'),
  constraint username_format check (username::text ~ '^[a-z0-9._-]{4,30}$')
);

create table eduplan_private.sessions (
  token_hash text primary key,
  account_id uuid not null references eduplan_private.accounts(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index sessions_account_id_idx on eduplan_private.sessions(account_id);
create index sessions_expires_at_idx on eduplan_private.sessions(expires_at);

create table eduplan_private.config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table eduplan_private.accounts enable row level security;
alter table eduplan_private.sessions enable row level security;
alter table eduplan_private.config enable row level security;
revoke all on all tables in schema eduplan_private from public, anon, authenticated;
revoke all on all sequences in schema eduplan_private from public, anon, authenticated;

create or replace function eduplan_private.account_json(a eduplan_private.accounts)
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'accountKey', a.id::text, 'email', a.email::text,
    'username', a.username::text, 'name', a.name,
    'role', a.role, 'status', a.status,
    'hasPassword', a.password_hash is not null,
    'avatarKey', a.avatar_key,
    'avatarUrl', case when a.avatar_key is null then null else '/api/avatar?key=' || a.avatar_key end,
    'phone', a.phone, 'bio', a.bio,
    'createdAt', a.created_at, 'updatedAt', a.updated_at
  )
$$;

create or replace function eduplan_private.valid_app_secret(p_secret text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from eduplan_private.config c
    where c.key = 'app_secret_hash'
      and c.value = extensions.crypt(coalesce(p_secret, ''), c.value)
  )
$$;

create or replace function public.eduplan_register(
  p_email text, p_username text, p_name text, p_password text, p_role text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_account eduplan_private.accounts;
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_username text := lower(trim(coalesce(p_username, '')));
  v_name text := trim(coalesce(p_name, ''));
begin
  if v_username !~ '^[a-z0-9._-]{4,30}$' or v_name = '' then raise exception 'Thông tin đăng ký chưa hợp lệ'; end if;
  if v_email is not null and v_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Email chưa hợp lệ'; end if;
  if length(coalesce(p_password, '')) < 8 then raise exception 'Mật khẩu cần ít nhất 8 ký tự'; end if;
  if p_role not in ('teacher','student','parent') then raise exception 'Vai trò không hợp lệ'; end if;

  insert into eduplan_private.accounts(email, username, name, role, status, password_hash)
  values (v_email, v_username, v_name, p_role, 'pending', extensions.crypt(p_password, extensions.gen_salt('bf', 12)))
  returning * into v_account;
  return jsonb_build_object('account', eduplan_private.account_json(v_account), 'message', 'Đăng ký thành công. Tài khoản đang chờ Admin duyệt.');
exception when unique_violation then raise exception 'Email hoặc tên tài khoản đã được sử dụng';
end
$$;

create or replace function public.eduplan_login(p_identifier text, p_password text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_account eduplan_private.accounts;
  v_token text;
  v_expires timestamptz := now() + interval '14 days';
begin
  select a.* into v_account from eduplan_private.accounts a
  where lower(a.username::text) = lower(trim(coalesce(p_identifier, '')))
     or (a.email is not null and lower(a.email::text) = lower(trim(coalesce(p_identifier, ''))))
  limit 1;
  if v_account.id is null or v_account.password_hash is null
     or extensions.crypt(coalesce(p_password, ''), v_account.password_hash) <> v_account.password_hash then
    raise exception 'Tên tài khoản/email hoặc mật khẩu không đúng';
  end if;
  if v_account.status = 'pending' then raise exception 'Tài khoản đang chờ Admin phê duyệt'; end if;
  if v_account.status = 'locked' then raise exception 'Tài khoản đã bị khóa. Vui lòng liên hệ Admin'; end if;
  delete from eduplan_private.sessions where expires_at <= now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into eduplan_private.sessions(token_hash, account_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_account.id, v_expires);
  return jsonb_build_object('authenticated', true, 'account', eduplan_private.account_json(v_account), 'token', v_token, 'expiresAt', v_expires);
end
$$;

create or replace function public.eduplan_server(p_secret text, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor eduplan_private.accounts;
  v_account eduplan_private.accounts;
  v_target eduplan_private.accounts;
  v_token text := coalesce(p_payload->>'token', '');
  v_id uuid;
  v_email text;
  v_username text;
  v_name text;
  v_role text;
  v_status text;
  v_password text;
  v_new_password text;
  v_current_password text;
  v_count bigint;
begin
  if not eduplan_private.valid_app_secret(p_secret) then raise exception 'Khóa máy chủ không hợp lệ'; end if;

  if p_action = 'count_accounts' then
    select count(*) into v_count from eduplan_private.accounts;
    return jsonb_build_object('count', v_count);
  end if;

  if p_action = 'get_account_by_email' then
    select a.* into v_account from eduplan_private.accounts a
    where a.email is not null and lower(a.email::text) = lower(trim(coalesce(p_payload->>'email', ''))) limit 1;
    return jsonb_build_object('account', case when v_account.id is null then null else eduplan_private.account_json(v_account) end);
  end if;

  if p_action = 'platform_upsert' then
    v_email := lower(trim(coalesce(p_payload->>'email', '')));
    v_name := trim(coalesce(p_payload->>'name', ''));
    v_role := coalesce(p_payload->>'role', 'student');
    if v_email = '' or v_name = '' then raise exception 'Thiếu thông tin tài khoản Google'; end if;
    select count(*) into v_count from eduplan_private.accounts;
    if v_count = 0 then v_role := 'admin'; end if;
    if v_role not in ('admin','teacher','student','parent') then raise exception 'Vai trò không hợp lệ'; end if;
    v_username := lower(regexp_replace(split_part(v_email, '@', 1), '[^a-z0-9._-]', '', 'g'));
    if length(v_username) < 4 then v_username := 'user_' || substr(encode(extensions.digest(v_email, 'sha256'), 'hex'), 1, 8); end if;
    while exists(select 1 from eduplan_private.accounts where username = v_username and email is distinct from v_email) loop
      v_username := left(v_username, 21) || '_' || substr(encode(extensions.gen_random_bytes(4), 'hex'), 1, 8);
    end loop;
    insert into eduplan_private.accounts(email, username, name, role, status)
    values(v_email, v_username, v_name, v_role, 'active')
    on conflict(email) do update set name = excluded.name, updated_at = now()
    returning * into v_account;
    return jsonb_build_object('authenticated', true, 'account', eduplan_private.account_json(v_account));
  end if;

  if p_action = 'get_session' then
    delete from eduplan_private.sessions where expires_at <= now();
    select a.* into v_account from eduplan_private.sessions s
    join eduplan_private.accounts a on a.id = s.account_id
    where s.token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex') and s.expires_at > now() limit 1;
    return jsonb_build_object('account', case when v_account.id is null then null else eduplan_private.account_json(v_account) end);
  end if;

  if p_action = 'logout' then
    delete from eduplan_private.sessions where token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex');
    return jsonb_build_object('signedOut', true);
  end if;

  select a.* into v_actor from eduplan_private.sessions s
  join eduplan_private.accounts a on a.id = s.account_id
  where s.token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex') and s.expires_at > now() limit 1;
  if v_actor.id is null then raise exception 'Cần đăng nhập'; end if;

  if p_action = 'avatar_owner' then
    return jsonb_build_object('exists', exists(select 1 from eduplan_private.accounts where avatar_key = p_payload->>'key'));
  end if;

  if p_action = 'avatar_update' then
    update eduplan_private.accounts set avatar_key = nullif(p_payload->>'key', ''), updated_at = now()
    where id = v_actor.id returning * into v_account;
    return jsonb_build_object('account', eduplan_private.account_json(v_account));
  end if;

  if p_action = 'profile_update' then
    v_name := trim(coalesce(p_payload->>'name', v_actor.name));
    v_username := lower(trim(coalesce(p_payload->>'username', v_actor.username::text)));
    v_new_password := coalesce(p_payload->>'newPassword', '');
    v_current_password := coalesce(p_payload->>'currentPassword', '');
    if v_name = '' or v_username !~ '^[a-z0-9._-]{4,30}$' then raise exception 'Họ tên hoặc tên tài khoản chưa hợp lệ'; end if;
    if exists(select 1 from eduplan_private.accounts where username = v_username and id <> v_actor.id) then raise exception 'Tên tài khoản đã được sử dụng'; end if;
    if v_new_password <> '' then
      if length(v_new_password) < 8 then raise exception 'Mật khẩu mới cần ít nhất 8 ký tự'; end if;
      if v_actor.password_hash is not null and extensions.crypt(v_current_password, v_actor.password_hash) <> v_actor.password_hash then raise exception 'Mật khẩu hiện tại không đúng'; end if;
    end if;
    update eduplan_private.accounts set
      name = v_name, username = v_username,
      phone = nullif(left(trim(coalesce(p_payload->>'phone', '')), 20), ''),
      bio = nullif(left(trim(coalesce(p_payload->>'bio', '')), 300), ''),
      password_hash = case when v_new_password = '' then password_hash else extensions.crypt(v_new_password, extensions.gen_salt('bf', 12)) end,
      updated_at = now()
    where id = v_actor.id returning * into v_account;
    return jsonb_build_object('account', eduplan_private.account_json(v_account), 'message', case when v_new_password = '' then 'Đã cập nhật hồ sơ' else 'Đã cập nhật hồ sơ và mật khẩu' end);
  end if;

  if v_actor.role <> 'admin' or v_actor.status <> 'active' then raise exception 'Chỉ quản trị viên được phép thực hiện'; end if;

  if p_action = 'list_accounts' then
    return jsonb_build_object('accounts', coalesce((select jsonb_agg(eduplan_private.account_json(a) order by a.created_at) from eduplan_private.accounts a), '[]'::jsonb));
  end if;

  if p_action = 'admin_create' then
    v_email := nullif(lower(trim(coalesce(p_payload->>'email', ''))), '');
    v_username := lower(trim(coalesce(p_payload->>'username', '')));
    v_name := trim(coalesce(p_payload->>'name', ''));
    v_password := coalesce(p_payload->>'password', '');
    v_role := coalesce(p_payload->>'role', 'student');
    v_status := coalesce(p_payload->>'status', 'active');
    if v_username !~ '^[a-z0-9._-]{4,30}$' or v_name = '' then raise exception 'Họ tên, tên tài khoản hoặc email không hợp lệ'; end if;
    if v_email is not null and v_email !~* '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then raise exception 'Email chưa hợp lệ'; end if;
    if length(v_password) < 8 then raise exception 'Mật khẩu ban đầu cần ít nhất 8 ký tự'; end if;
    if v_role not in ('admin','teacher','student','parent') or v_status not in ('active','pending','locked') then raise exception 'Vai trò hoặc trạng thái không hợp lệ'; end if;
    insert into eduplan_private.accounts(email, username, name, role, status, password_hash)
    values(v_email, v_username, v_name, v_role, v_status, extensions.crypt(v_password, extensions.gen_salt('bf', 12)))
    returning * into v_account;
    return jsonb_build_object('account', eduplan_private.account_json(v_account));
  end if;

  v_id := nullif(p_payload->>'accountKey', '')::uuid;
  select a.* into v_target from eduplan_private.accounts a where a.id = v_id;
  if v_target.id is null then raise exception 'Không tìm thấy tài khoản'; end if;

  if p_action = 'admin_delete' then
    if v_target.id = v_actor.id then raise exception 'Không thể xóa tài khoản Admin đang đăng nhập'; end if;
    delete from eduplan_private.accounts where id = v_target.id;
    return jsonb_build_object('deleted', true);
  end if;

  if p_action = 'admin_update' then
    v_username := lower(trim(coalesce(p_payload->>'username', v_target.username::text)));
    v_name := trim(coalesce(p_payload->>'name', v_target.name));
    v_role := coalesce(p_payload->>'role', v_target.role);
    v_status := coalesce(p_payload->>'status', v_target.status);
    if v_username !~ '^[a-z0-9._-]{4,30}$' or v_name = '' then raise exception 'Họ tên hoặc tên tài khoản chưa hợp lệ'; end if;
    if v_role not in ('admin','teacher','student','parent') or v_status not in ('active','pending','locked') then raise exception 'Vai trò hoặc trạng thái không hợp lệ'; end if;
    if v_target.id = v_actor.id and (v_role <> 'admin' or v_status <> 'active') then raise exception 'Không thể hạ quyền hoặc khóa tài khoản Admin đang đăng nhập'; end if;
    if exists(select 1 from eduplan_private.accounts where username = v_username and id <> v_target.id) then raise exception 'Tên tài khoản đã được sử dụng'; end if;
    update eduplan_private.accounts set username = v_username, name = v_name, role = v_role, status = v_status, updated_at = now()
    where id = v_target.id returning * into v_account;
    return jsonb_build_object('account', eduplan_private.account_json(v_account));
  end if;

  raise exception 'Thao tác không được hỗ trợ';
exception
  when unique_violation then raise exception 'Email hoặc tên tài khoản đã được sử dụng';
  when invalid_text_representation then raise exception 'Mã tài khoản không hợp lệ';
end
$$;

revoke all on function public.eduplan_register(text,text,text,text,text) from public;
revoke all on function public.eduplan_login(text,text) from public;
revoke all on function public.eduplan_server(text,text,jsonb) from public;
grant execute on function public.eduplan_register(text,text,text,text,text) to anon, authenticated;
grant execute on function public.eduplan_login(text,text) to anon, authenticated;
grant execute on function public.eduplan_server(text,text,jsonb) to anon, authenticated;
