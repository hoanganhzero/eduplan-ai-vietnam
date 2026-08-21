create or replace function public.eduplan_platform_session(p_secret text, p_email text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account eduplan_private.accounts;
  v_token text;
  v_expires timestamptz := now() + interval '14 days';
begin
  if not eduplan_private.valid_app_secret(p_secret) then
    raise exception 'Khóa máy chủ không hợp lệ';
  end if;
  select a.* into v_account
  from eduplan_private.accounts a
  where a.email is not null and lower(a.email::text) = lower(trim(coalesce(p_email, '')))
  limit 1;
  if v_account.id is null then raise exception 'Không tìm thấy tài khoản'; end if;
  if v_account.status <> 'active' then raise exception 'Tài khoản chưa sẵn sàng'; end if;
  delete from eduplan_private.sessions where expires_at <= now();
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into eduplan_private.sessions(token_hash, account_id, expires_at)
  values (encode(extensions.digest(v_token, 'sha256'), 'hex'), v_account.id, v_expires);
  return jsonb_build_object(
    'authenticated', true,
    'account', eduplan_private.account_json(v_account),
    'token', v_token,
    'expiresAt', v_expires
  );
end
$$;

revoke all on function public.eduplan_platform_session(text,text) from public;
grant execute on function public.eduplan_platform_session(text,text) to anon, authenticated;
