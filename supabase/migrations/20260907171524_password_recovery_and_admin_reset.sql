alter table eduplan_private.accounts
  add column if not exists password_reset_requested_at timestamptz,
  add column if not exists password_changed_at timestamptz;

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
    'passwordResetRequestedAt', a.password_reset_requested_at,
    'passwordChangedAt', a.password_changed_at,
    'createdAt', a.created_at, 'updatedAt', a.updated_at
  )
$$;

create or replace function public.eduplan_request_password_reset(p_identifier text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_identifier text := lower(trim(coalesce(p_identifier, '')));
begin
  if v_identifier = '' then raise exception 'Vui lòng nhập tên tài khoản hoặc email'; end if;
  update eduplan_private.accounts a
  set password_reset_requested_at = now()
  where a.status = 'active'
    and (lower(a.username::text) = v_identifier or (a.email is not null and lower(a.email::text) = v_identifier))
    and (a.password_reset_requested_at is null or a.password_reset_requested_at < now() - interval '15 minutes');
  return jsonb_build_object('requested', true, 'message', 'Nếu tài khoản tồn tại, yêu cầu đặt lại mật khẩu đã được ghi nhận.');
end
$$;

create or replace function public.eduplan_password_security(
  p_secret text, p_action text, p_payload jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_actor eduplan_private.accounts;
  v_target eduplan_private.accounts;
  v_account eduplan_private.accounts;
  v_token_hash text := encode(extensions.digest(coalesce(p_payload->>'token', ''), 'sha256'), 'hex');
  v_new_password text := coalesce(p_payload->>'newPassword', '');
  v_current_password text := coalesce(p_payload->>'currentPassword', '');
  v_platform_verified boolean := coalesce(p_payload->>'platformVerified', 'false') = 'true';
  v_id uuid;
begin
  if not eduplan_private.valid_app_secret(p_secret) then raise exception 'Khóa máy chủ không hợp lệ'; end if;
  select a.* into v_actor from eduplan_private.sessions s
  join eduplan_private.accounts a on a.id = s.account_id
  where s.token_hash = v_token_hash and s.expires_at > now() limit 1;
  if v_actor.id is null or v_actor.status <> 'active' then raise exception 'Cần đăng nhập'; end if;
  if length(v_new_password) < 8 then raise exception 'Mật khẩu mới cần ít nhất 8 ký tự'; end if;

  if p_action = 'change_own' then
    if v_actor.password_hash is not null and not v_platform_verified
      and extensions.crypt(v_current_password, v_actor.password_hash) <> v_actor.password_hash then
      raise exception 'Mật khẩu hiện tại không đúng';
    end if;
    update eduplan_private.accounts
    set password_hash = extensions.crypt(v_new_password, extensions.gen_salt('bf', 12)),
        password_reset_requested_at = null, password_changed_at = now(), updated_at = now()
    where id = v_actor.id returning * into v_account;
    delete from eduplan_private.sessions where account_id = v_actor.id and token_hash <> v_token_hash;
    return jsonb_build_object('account', eduplan_private.account_json(v_account), 'message', 'Đã đổi mật khẩu');
  end if;

  if v_actor.role <> 'admin' then raise exception 'Chỉ quản trị viên được phép thực hiện'; end if;
  if p_action <> 'admin_reset' then raise exception 'Thao tác không được hỗ trợ'; end if;
  v_id := nullif(p_payload->>'accountKey', '')::uuid;
  select a.* into v_target from eduplan_private.accounts a where a.id = v_id;
  if v_target.id is null then raise exception 'Không tìm thấy tài khoản'; end if;
  update eduplan_private.accounts
  set password_hash = extensions.crypt(v_new_password, extensions.gen_salt('bf', 12)),
      password_reset_requested_at = null, password_changed_at = now(), updated_at = now()
  where id = v_target.id returning * into v_account;
  delete from eduplan_private.sessions where account_id = v_target.id;
  return jsonb_build_object('account', eduplan_private.account_json(v_account), 'message', 'Đã đặt mật khẩu mới cho tài khoản');
exception when invalid_text_representation then raise exception 'Mã tài khoản không hợp lệ';
end
$$;

revoke all on function public.eduplan_request_password_reset(text) from public;
revoke all on function public.eduplan_password_security(text,text,jsonb) from public;
grant execute on function public.eduplan_request_password_reset(text) to anon, authenticated;
grant execute on function public.eduplan_password_security(text,text,jsonb) to anon, authenticated;
