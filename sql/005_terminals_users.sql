-- =====================================================================
-- Eko TransitCare — 005_terminals_users.sql
-- Run ONCE in Supabase → SQL Editor (paste the TEXT of the file, not its name),
-- AFTER 001, 002, 003 and 004. Safe to run again.
--
-- 1. Routes know which terminal(s) buses leave from. The driver's and operator's
--    "terminal" list is then limited to the terminals of the chosen route.
-- 2. Administrators can add, EDIT and DELETE terminals and routes.
-- 3. Administrators can see who has not verified their email and verify them
--    (for people who never receive the email), and view all users.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Which terminals serve which route
-- ---------------------------------------------------------------------
do $$
declare
  v_route_type text; v_term_type text; v_new boolean := false;
begin
  if to_regclass('public.route_terminals') is null then
    v_new := true;
    select format_type(a.atttypid, a.atttypmod) into v_route_type
      from pg_attribute a where a.attrelid = 'public.routes'::regclass and a.attname = 'id' and not a.attisdropped;
    select format_type(a.atttypid, a.atttypmod) into v_term_type
      from pg_attribute a where a.attrelid = 'public.terminals'::regclass and a.attname = 'id' and not a.attisdropped;
    execute format(
      'create table public.route_terminals (
         route_id    %s not null references public.routes(id)    on delete cascade,
         terminal_id %s not null references public.terminals(id) on delete cascade,
         primary key (route_id, terminal_id))', v_route_type, v_term_type);
  end if;

  alter table public.route_terminals enable row level security;

  if not exists (select 1 from pg_policies where schemaname = 'public'
                 and tablename = 'route_terminals' and policyname = 'route_terminals_read') then
    create policy route_terminals_read on public.route_terminals for select to authenticated using (true);
  end if;

  -- First time only: link each route to terminals whose name/location mentions the route's ORIGIN.
  -- (e.g. origin "CMS" -> a terminal called "CMS Bus Terminal"). Administrators can change it afterwards.
  if v_new then
    insert into public.route_terminals (route_id, terminal_id)
    select r.id, t.id
    from public.routes r
    join public.terminals t
      on length(btrim(coalesce(r.origin, ''))) > 1
     and lower(coalesce(t.name, '') || ' ' || coalesce(t.location, '')) like '%' || lower(btrim(r.origin)) || '%'
    on conflict do nothing;
  end if;
end $$;

grant select on public.route_terminals to authenticated;

-- A trip may only use a terminal that serves its route (when the route has terminals set).
create or replace function public.tc_check_trip_terminal()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.terminal_id is not null and new.route_id is not null
     and exists (select 1 from public.route_terminals rt where rt.route_id = new.route_id)
     and not exists (select 1 from public.route_terminals rt
                     where rt.route_id = new.route_id and rt.terminal_id = new.terminal_id) then
    raise exception 'That terminal does not serve the chosen route. Please pick one of the terminals set for this route.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists tc_check_trip_terminal on public.trips;
create trigger tc_check_trip_terminal
  before insert or update of terminal_id, route_id on public.trips
  for each row execute function public.tc_check_trip_terminal();

-- ---------------------------------------------------------------------
-- 2. Admin: terminals (add / edit / delete)
-- ---------------------------------------------------------------------
create or replace function public.tc_admin_save_terminal(
  p_id uuid, p_name text, p_location text, p_description text, p_contact text, p_status text default 'active')
returns json
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_name text := btrim(coalesce(p_name, '')); v_id uuid := p_id;
begin
  if not public.tc_is_admin() then
    raise exception 'Only administrators can manage terminals.' using errcode = '42501';
  end if;
  if v_name = '' then raise exception 'Terminal name is required.'; end if;
  if coalesce(p_status, 'active') not in ('active', 'inactive') then raise exception 'Status must be active or inactive.'; end if;
  if exists (select 1 from public.terminals t where lower(t.name) = lower(v_name) and (p_id is null or t.id <> p_id)) then
    raise exception 'A terminal called "%" already exists.', v_name;
  end if;

  if p_id is null then
    insert into public.terminals (name, location, description, contact_info, status)
    values (v_name, nullif(btrim(coalesce(p_location, '')), ''), nullif(btrim(coalesce(p_description, '')), ''),
            nullif(btrim(coalesce(p_contact, '')), ''), coalesce(p_status, 'active'))
    returning id into v_id;
  else
    update public.terminals
       set name = v_name,
           location = nullif(btrim(coalesce(p_location, '')), ''),
           description = nullif(btrim(coalesce(p_description, '')), ''),
           contact_info = nullif(btrim(coalesce(p_contact, '')), ''),
           status = coalesce(p_status, 'active')
     where id = p_id;
    if not found then raise exception 'Terminal not found.'; end if;
  end if;

  begin
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), case when p_id is null then 'terminal_added' else 'terminal_updated' end, 'terminal', v_id,
            to_jsonb(json_build_object('name', v_name)));
  exception when others then null; end;

  return json_build_object('id', v_id, 'name', v_name);
end;
$$;

create or replace function public.tc_admin_delete_terminal(p_id uuid)
returns json
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_name text; v_trips int;
begin
  if not public.tc_is_admin() then
    raise exception 'Only administrators can manage terminals.' using errcode = '42501';
  end if;
  select name into v_name from public.terminals where id = p_id;
  if not found then raise exception 'Terminal not found.'; end if;

  select count(*)::int into v_trips from public.trips where terminal_id = p_id;
  if v_trips > 0 then
    raise exception 'This terminal is used by % trip(s), so it cannot be deleted. Edit it and set the status to Inactive to stop it being offered.', v_trips;
  end if;

  delete from public.terminals where id = p_id;   -- its route links are removed automatically

  begin
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'terminal_deleted', 'terminal', p_id, to_jsonb(json_build_object('name', v_name)));
  exception when others then null; end;

  return json_build_object('deleted', true, 'name', v_name);
end;
$$;

-- ---------------------------------------------------------------------
-- 2b. Admin: routes (add / edit / delete, with the terminals buses leave from)
-- ---------------------------------------------------------------------
create or replace function public.tc_admin_save_route(
  p_id uuid, p_origin text, p_destination text, p_base_fare numeric, p_estimated_minutes int,
  p_status text, p_terminal_ids uuid[])
returns json
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_o text := btrim(coalesce(p_origin, '')); v_d text := btrim(coalesce(p_destination, '')); v_id uuid := p_id;
begin
  if not public.tc_is_admin() then
    raise exception 'Only administrators can manage routes.' using errcode = '42501';
  end if;
  if v_o = '' or v_d = '' then raise exception 'Origin and destination are required.'; end if;
  if lower(v_o) = lower(v_d) then raise exception 'Origin and destination cannot be the same place.'; end if;
  if coalesce(p_base_fare, 0) < 0 then raise exception 'Fare cannot be negative.'; end if;
  if p_estimated_minutes is not null and p_estimated_minutes < 1 then raise exception 'Estimated minutes must be at least 1.'; end if;
  if coalesce(p_status, 'active') not in ('active', 'inactive') then raise exception 'Status must be active or inactive.'; end if;
  if exists (select 1 from public.routes r
             where lower(r.origin) = lower(v_o) and lower(r.destination) = lower(v_d) and (p_id is null or r.id <> p_id)) then
    raise exception 'The route % → % already exists.', v_o, v_d;
  end if;
  if p_terminal_ids is not null and exists (
       select 1 from unnest(p_terminal_ids) x(tid) where not exists (select 1 from public.terminals t where t.id = x.tid)) then
    raise exception 'One of the chosen terminals no longer exists.';
  end if;

  if p_id is null then
    insert into public.routes (origin, destination, base_fare, estimated_minutes, status)
    values (v_o, v_d, p_base_fare, p_estimated_minutes, coalesce(p_status, 'active'))
    returning id into v_id;
  else
    update public.routes
       set origin = v_o, destination = v_d, base_fare = p_base_fare,
           estimated_minutes = p_estimated_minutes, status = coalesce(p_status, 'active')
     where id = p_id;
    if not found then raise exception 'Route not found.'; end if;
  end if;

  -- Replace the set of departure terminals for this route.
  delete from public.route_terminals where route_id = v_id
    and (p_terminal_ids is null or terminal_id <> all (p_terminal_ids));
  if p_terminal_ids is not null then
    insert into public.route_terminals (route_id, terminal_id)
    select v_id, x.tid from (select distinct unnest(p_terminal_ids) as tid) x
    on conflict do nothing;
  end if;

  begin
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), case when p_id is null then 'route_added' else 'route_updated' end, 'route', v_id,
            to_jsonb(json_build_object('origin', v_o, 'destination', v_d)));
  exception when others then null; end;

  return json_build_object('id', v_id, 'origin', v_o, 'destination', v_d);
end;
$$;

create or replace function public.tc_admin_delete_route(p_id uuid)
returns json
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare v_o text; v_d text; v_trips int;
begin
  if not public.tc_is_admin() then
    raise exception 'Only administrators can manage routes.' using errcode = '42501';
  end if;
  select origin, destination into v_o, v_d from public.routes where id = p_id;
  if not found then raise exception 'Route not found.'; end if;

  select count(*)::int into v_trips from public.trips where route_id = p_id;
  if v_trips > 0 then
    raise exception 'This route is used by % trip(s), so it cannot be deleted. Edit it and set the status to Inactive to stop it being offered.', v_trips;
  end if;

  delete from public.routes where id = p_id;

  begin
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'route_deleted', 'route', p_id, to_jsonb(json_build_object('origin', v_o, 'destination', v_d)));
  exception when others then null; end;

  return json_build_object('deleted', true);
end;
$$;

-- ---------------------------------------------------------------------
-- 3. Admin: users and email verification
-- ---------------------------------------------------------------------
create or replace function public.tc_admin_list_users()
returns json
language plpgsql stable security definer
set search_path = public, auth, pg_temp
as $$
begin
  if not public.tc_is_admin() then
    raise exception 'Only administrators can view all users.' using errcode = '42501';
  end if;
  return coalesce((
    select json_agg(x order by x.created_at desc)
    from (
      select p.id, p.full_name, p.email, p.phone, p.role, coalesce(p.status, 'active') as status, p.created_at,
             u.email_confirmed_at, u.phone_confirmed_at, u.last_sign_in_at,
             (u.email is not null) as has_email
      from public.profiles p
      left join auth.users u on u.id = p.id
    ) x
  ), '[]'::json);
end;
$$;

-- Marks the person's email (or phone) as verified so they can sign in straight away.
-- For people who never receive the confirmation email.
create or replace function public.tc_admin_verify_user(p_user_id uuid)
returns json
language plpgsql security definer
set search_path = public, auth, pg_temp
as $$
declare v_u auth.users%rowtype; v_name text;
begin
  if not public.tc_is_admin() then
    raise exception 'Only administrators can verify accounts.' using errcode = '42501';
  end if;
  select * into v_u from auth.users where id = p_user_id;
  if not found then raise exception 'Account not found.'; end if;

  update auth.users
     set email_confirmed_at = case when email is not null and email_confirmed_at is null then now() else email_confirmed_at end,
         phone_confirmed_at = case when phone is not null and phone_confirmed_at is null then now() else phone_confirmed_at end
   where id = p_user_id;

  select full_name into v_name from public.profiles where id = p_user_id;

  begin
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'user_verified_by_admin', 'profile', p_user_id, to_jsonb(json_build_object('name', v_name)));
  exception when others then null; end;
  begin
    insert into public.notifications (recipient_id, title, message, type, related_entity)
    values (p_user_id, 'Account verified', 'An administrator verified your account. You can use the app now.', 'account_verified', p_user_id);
  exception when others then null; end;

  return json_build_object('verified', true, 'id', p_user_id, 'name', v_name);
end;
$$;

-- Who may call what: signed-in users only (each function checks admin itself).
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('tc_admin_save_terminal','tc_admin_delete_terminal','tc_admin_save_route',
                        'tc_admin_delete_route','tc_admin_list_users','tc_admin_verify_user')
  loop
    execute format('revoke all on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated', r.sig);
  end loop;
end $$;

-- CHECK (read-only): routes and the terminals they now use.
select r.origin, r.destination, coalesce(string_agg(t.name, ', ' order by t.name), '(none set - an admin should assign one)') as terminals
from public.routes r
left join public.route_terminals rt on rt.route_id = r.id
left join public.terminals t on t.id = rt.terminal_id
group by r.id, r.origin, r.destination order by r.origin, r.destination;
