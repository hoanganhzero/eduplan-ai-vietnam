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
  values (v_email, v_username, v_name, p_role, 'active', extensions.crypt(p_password, extensions.gen_salt('bf', 12)))
  returning * into v_account;
  return jsonb_build_object(
    'account', eduplan_private.account_json(v_account),
    'message', 'Đăng ký thành công. Tài khoản đã được kích hoạt.'
  );
exception when unique_violation then raise exception 'Email hoặc tên tài khoản đã được sử dụng';
end
$$;

update eduplan_private.accounts
set status = 'active', updated_at = now()
where status = 'pending';

