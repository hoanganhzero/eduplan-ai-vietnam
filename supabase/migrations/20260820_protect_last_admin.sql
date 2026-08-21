create or replace function eduplan_private.protect_last_active_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'admin' and old.status = 'active'
    and (tg_op = 'DELETE' or new.role <> 'admin' or new.status <> 'active')
    and not exists (
      select 1 from eduplan_private.accounts
      where id <> old.id and role = 'admin' and status = 'active'
    ) then
    raise exception 'Hệ thống phải luôn có ít nhất một Admin đang hoạt động';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

drop trigger if exists protect_last_active_admin on eduplan_private.accounts;
create trigger protect_last_active_admin
before update of role, status or delete on eduplan_private.accounts
for each row execute function eduplan_private.protect_last_active_admin();

revoke all on function eduplan_private.protect_last_active_admin() from public, anon, authenticated;
