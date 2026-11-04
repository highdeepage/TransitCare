-- =====================================================================
-- Eko TransitCare — 004_admin_management.sql
-- Run ONCE in Supabase → SQL Editor (paste the TEXT of the file, not its name),
-- AFTER 001, 002 and 003. Safe to run again.
--
-- Lets administrators manage other administrators:
--   add (promote a verified account), view, edit, suspend/reactivate, demote, delete.
-- Rules enforced here, in the database, not just in the screen:
--   * only an ACTIVE administrator can use any of it
--   * you cannot suspend, demote or delete yourself
--   * the platform can never be left without an active administrator
--   * a suspended administrator immediately loses every admin power
-- =====================================================================

-- An administrator must be ACTIVE. (Same function as in 002/003, now stricter.)
create or replace function public.tc_is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles p
                 where p.id = auth.uid() and p.role = 'admin' and coalesce(p.status, 'active') = 'active');
$$;

-- How many ACTIVE administrators exist, not counting one person.
create or replace function public.tc_active_admins_except(p_except uuid)
returns int
language sql stable security definer
set search_path = public, pg_temp
as $$
  select count(*)::int from public.profiles p
  where p.role = 'admin' and coalesce(p.status, 'active') = 'active'
    and (p_except is null or p.id <> p_except);
$$;

-- 1. LIST ------------------------------------------------------------
create or replace function public.tc_admin_list_admins()
returns json
language plpgsql stable security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.tc_is_admin() then
    raise exception 'Only administrators can view administrators.' using errcode = '42501';
  end if;
  return coalesce((
    select json_agg(x order by x.created_at)
    from (
      select p.id, p.full_name, p.email, p.phone, coalesce(p.status, 'active') as status,
             p.created_at, u.last_sign_in_at
      from public.profiles p
      left join auth.users u on u.id = p.id
      where p.role = 'admin'
    ) x
  ), '[]'::json);
end;
$$;

-- 2. ADD (promote an existing, verified account) ---------------------
create or replace function public.tc_admin_promote(p_identifier text)
returns json
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_in  text := btrim(coalesce(p_identifier, ''));
  v_p   public.profiles%rowtype;
  v_ok  boolean;
  v_digits text;
begin
  if not public.tc_is_admin() then
    raise exception 'Only administrators can add administrators.' using errcode = '42501';
  end if;
  if v_in = '' then raise exception 'Enter the email address or phone number of the account.'; end if;

  if position('@' in v_in) > 0 then
    select * into v_p from public.profiles where lower(email) = lower(v_in) limit 1;
  else
    v_digits := right(regexp_replace(v_in, '\D', '', 'g'), 10);
    if length(v_digits) < 7 then raise exception 'That phone number looks too short.'; end if;
    select * into v_p from public.profiles
      where right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_digits limit 1;
  end if;

  if not found then
    raise exception 'No account found for that email or phone. The person must first create a normal account and verify it.';
  end if;
  if v_p.role = 'admin' then raise exception 'That account is already an administrator.'; end if;

  select (u.email_confirmed_at is not null or u.phone_confirmed_at is not null) into v_ok
  from auth.users u where u.id = v_p.id;
  if not coalesce(v_ok, false) then
    raise exception 'That account has not verified its email or phone yet, so it cannot be made an administrator.';
  end if;

  if v_p.role = 'driver' and exists (
    select 1 from public.trips t where t.driver_id = v_p.id and t.status in ('scheduled','boarding','in_transit')
  ) then
    raise exception 'This driver still has open trips. Cancel or finish them first.';
  end if;

  update public.profiles set role = 'admin', status = 'active', operator_id = null where id = v_p.id;

  begin
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'admin_added', 'profile', v_p.id,
            to_jsonb(json_build_object('name', v_p.full_name, 'email', v_p.email, 'previous_role', v_p.role)));
  exception when others then null; end;
  begin
    insert into public.notifications (recipient_id, title, message, type, related_entity)
    values (v_p.id, 'You are now an administrator',
            'An administrator gave you admin access. Sign out and back in to see the admin menu.',
            'admin_added', v_p.id);
  exception when others then null; end;

  return json_build_object('id', v_p.id, 'full_name', v_p.full_name, 'email', v_p.email, 'previous_role', v_p.role);
end;
$$;

-- 3a. EDIT details / suspend / reactivate ----------------------------
create or replace function public.tc_admin_update_admin(
  p_id uuid, p_full_name text, p_phone text, p_status text)
returns json
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_t public.profiles%rowtype; v_name text := btrim(coalesce(p_full_name, ''));
begin
  if not public.tc_is_admin() then
    raise exception 'Only administrators can edit administrators.' using errcode = '42501';
  end if;
  select * into v_t from public.profiles where id = p_id;
  if not found or v_t.role <> 'admin' then raise exception 'Administrator not found.'; end if;
  if v_name = '' then raise exception 'Name cannot be empty.'; end if;
  if p_status not in ('active', 'suspended') then raise exception 'Status must be active or suspended.'; end if;

  if p_status = 'suspended' and coalesce(v_t.status, 'active') = 'active' then
    if p_id = auth.uid() then raise exception 'You cannot suspend your own account.'; end if;
    if public.tc_active_admins_except(p_id) < 1 then
      raise exception 'You cannot suspend the last active administrator.';
    end if;
  end if;

  update public.profiles
     set full_name = v_name, phone = nullif(btrim(coalesce(p_phone, '')), ''), status = p_status
   where id = p_id;

  begin
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'admin_updated', 'profile', p_id,
            to_jsonb(json_build_object('status', p_status, 'name', v_name)));
  exception when others then null; end;

  return json_build_object('id', p_id, 'full_name', v_name, 'status', p_status);
end;
$$;

-- 3b. DEMOTE (back to an ordinary role) ------------------------------
create or replace function public.tc_admin_demote(p_id uuid, p_role text default 'passenger')
returns json
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_t public.profiles%rowtype; v_status text;
begin
  if not public.tc_is_admin() then
    raise exception 'Only administrators can change administrators.' using errcode = '42501';
  end if;
  if p_role not in ('passenger', 'driver', 'operator') then
    raise exception 'The new role must be passenger, driver or operator.';
  end if;
  if p_id = auth.uid() then raise exception 'You cannot remove your own administrator access.'; end if;
  select * into v_t from public.profiles where id = p_id;
  if not found or v_t.role <> 'admin' then raise exception 'Administrator not found.'; end if;
  if coalesce(v_t.status, 'active') = 'active' and public.tc_active_admins_except(p_id) < 1 then
    raise exception 'You cannot remove the last active administrator.';
  end if;

  v_status := case when p_role = 'driver' then 'email_verified' else 'active' end;  -- drivers need approval again
  update public.profiles set role = p_role, status = v_status where id = p_id;

  begin
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'admin_removed', 'profile', p_id, to_jsonb(json_build_object('new_role', p_role)));
  exception when others then null; end;

  return json_build_object('id', p_id, 'role', p_role);
end;
$$;

-- 4. DELETE an administrator account ---------------------------------
create or replace function public.tc_admin_delete_admin(p_id uuid)
returns json
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_t public.profiles%rowtype;
begin
  if not public.tc_is_admin() then
    raise exception 'Only administrators can delete administrators.' using errcode = '42501';
  end if;
  if p_id = auth.uid() then raise exception 'You cannot delete your own account.'; end if;
  select * into v_t from public.profiles where id = p_id;
  if not found or v_t.role <> 'admin' then raise exception 'Administrator not found.'; end if;
  if coalesce(v_t.status, 'active') = 'active' and public.tc_active_admins_except(p_id) < 1 then
    raise exception 'You cannot delete the last active administrator.';
  end if;

  -- Same careful clean-up as deleting any user; if it fails, this whole step is undone.
  update public.profiles set role = 'passenger' where id = p_id;
  perform public.tc_admin_delete_user(p_id);

  return json_build_object('deleted', true, 'role', 'admin', 'name', v_t.full_name);
end;
$$;

-- Who may call what: signed-in users only (each function checks admin itself).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('tc_admin_list_admins','tc_admin_promote','tc_admin_update_admin',
                        'tc_admin_demote','tc_admin_delete_admin','tc_active_admins_except')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- CHECK (read-only): the administrators right now.
select id, full_name, email, status, created_at from public.profiles where role = 'admin' order by created_at;
