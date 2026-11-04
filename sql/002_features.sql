-- =====================================================================
-- Eko TransitCare — 002_features.sql
-- Run ONCE in Supabase → SQL Editor → New query → Run.
-- Safe to run again (everything is "create or replace" / "if not exists").
--
-- Adds: trip sharing, ticket validation, admin delete-user, operator tools,
--       cancel-trip, unique trip/vehicle/ticket codes.
-- All functions are SECURITY DEFINER and check who is calling, so they work
-- with Row Level Security switched on and never expose service-role keys.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Columns / constraints this update relies on
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists operator_id uuid;
alter table public.vehicles add column if not exists operator_id uuid;

-- Keep history when a driver / passenger account is deleted.
alter table public.trips    alter column driver_id    drop not null;
alter table public.bookings alter column passenger_id drop not null;

-- ---------------------------------------------------------------------
-- 1. Unique ids (no duplicate trip codes, vehicle plates or ticket codes)
-- ---------------------------------------------------------------------
-- 1a. Repair existing duplicate trip codes (keeps the oldest, renames the rest)
with d as (
  select id,
         row_number() over (partition by trip_code order by created_at, id) as rn
  from public.trips
  where trip_code is not null
)
update public.trips t
set trip_code = t.trip_code || '-' || upper(substr(replace(t.id::text, '-', ''), 1, 4))
from d
where d.id = t.id and d.rn > 1;

create unique index if not exists trips_trip_code_unique on public.trips (trip_code);
create unique index if not exists vehicles_registration_unique
  on public.vehicles (upper(registration_number));
create unique index if not exists tickets_ticket_code_unique on public.tickets (ticket_code);

-- ---------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------
create or replace function public.tc_is_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.status, 'active') = 'active');
$$;

create or replace function public.tc_my_operator_id()
returns public.profiles.operator_id%type language sql stable security definer
set search_path = public, pg_temp as $$
  select p.operator_id from public.profiles p where p.id = auth.uid() and p.role = 'operator';
$$;

create or replace function public.tc_new_trip_code()
returns text language plpgsql volatile security definer
set search_path = public, pg_temp as $$
declare v_code text;
begin
  loop
    v_code := 'TC-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.trips where trip_code = v_code);
  end loop;
  return v_code;
end $$;

-- ---------------------------------------------------------------------
-- 3. TRIP SHARING (passenger → friend, no login needed for the friend)
-- ---------------------------------------------------------------------
do $$
declare v_type text;
begin
  select format_type(a.atttypid, a.atttypmod) into v_type
  from pg_attribute a
  where a.attrelid = 'public.trips'::regclass and a.attname = 'id' and not a.attisdropped;

  execute format($f$
    create table if not exists public.trip_shares (
      id          uuid primary key default gen_random_uuid(),
      code        text not null unique,
      trip_id     %s not null references public.trips(id) on delete cascade,
      created_by  uuid not null references auth.users(id) on delete cascade,
      created_at  timestamptz not null default now(),
      expires_at  timestamptz not null default (now() + interval '24 hours'),
      revoked_at  timestamptz
    )$f$, v_type);
end $$;

alter table public.trip_shares enable row level security;
-- No policies on purpose: the table is only reachable through the functions below.
revoke all on public.trip_shares from anon, authenticated;

create or replace function public.tc_create_trip_share(p_trip_id uuid)
returns text language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_trip record;
  v_code text;
begin
  if v_uid is null then raise exception 'Please sign in first.'; end if;

  select id, status, driver_id into v_trip from public.trips where id = p_trip_id;
  if not found then raise exception 'Trip not found.'; end if;
  if v_trip.status in ('completed', 'cancelled') then
    raise exception 'This trip has already ended.';
  end if;

  if not (
    exists (select 1 from public.bookings b
            where b.trip_id = p_trip_id and b.passenger_id = v_uid
              and b.status in ('reserved', 'boarded'))
    or v_trip.driver_id = v_uid
    or public.tc_is_admin()
  ) then
    raise exception 'You can only share a trip you have booked.';
  end if;

  select s.code into v_code
  from public.trip_shares s
  where s.trip_id = p_trip_id and s.created_by = v_uid
    and s.revoked_at is null and s.expires_at > now()
  order by s.created_at desc limit 1;

  if v_code is null then
    v_code := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.trip_shares (code, trip_id, created_by) values (v_code, p_trip_id, v_uid);
  end if;
  return v_code;
end $$;

create or replace function public.tc_my_trip_share(p_trip_id uuid)
returns text language sql stable security definer
set search_path = public, pg_temp as $$
  select s.code from public.trip_shares s
  where s.trip_id = p_trip_id and s.created_by = auth.uid()
    and s.revoked_at is null and s.expires_at > now()
  order by s.created_at desc limit 1;
$$;

create or replace function public.tc_revoke_trip_share(p_trip_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  update public.trip_shares set revoked_at = now()
  where trip_id = p_trip_id and created_by = auth.uid() and revoked_at is null;
end $$;

-- Public (anonymous) read of ONE shared trip. Returns null if the code is
-- unknown, revoked or expired. Shows no passenger, seat, ticket or phone data.
create or replace function public.tc_get_trip_share(p_code text)
returns json language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  r record;
  v_loc record;
begin
  if p_code is null or length(p_code) < 32 then return null; end if;

  select t.id as trip_id, t.trip_code, t.status, t.planned_departure, t.actual_departure,
         t.actual_arrival, s.expires_at,
         rt.origin, rt.destination, v.registration_number,
         split_part(coalesce(d.full_name, ''), ' ', 1) as driver_first_name
  into r
  from public.trip_shares s
  join public.trips t on t.id = s.trip_id
  left join public.routes rt on rt.id = t.route_id
  left join public.vehicles v on v.id = t.vehicle_id
  left join public.profiles d on d.id = t.driver_id
  where s.code = p_code and s.revoked_at is null and s.expires_at > now();

  if not found then return null; end if;

  -- Ended trips stay visible for 2 hours so the friend sees "arrived".
  if r.status in ('completed', 'cancelled')
     and coalesce(r.actual_arrival, r.planned_departure) < now() - interval '2 hours' then
    return null;
  end if;

  select l.latitude, l.longitude, l.recorded_at into v_loc
  from public.trip_locations l where l.trip_id = r.trip_id
  order by l.recorded_at desc limit 1;

  return json_build_object(
    'trip_code', r.trip_code,
    'status', r.status,
    'origin', r.origin,
    'destination', r.destination,
    'vehicle', r.registration_number,
    'driver_first_name', nullif(r.driver_first_name, ''),
    'planned_departure', r.planned_departure,
    'actual_departure', r.actual_departure,
    'actual_arrival', r.actual_arrival,
    'expires_at', r.expires_at,
    'location', case when v_loc.recorded_at is null then null
                else json_build_object('lat', v_loc.latitude, 'lng', v_loc.longitude,
                                       'recorded_at', v_loc.recorded_at) end
  );
end $$;

-- ---------------------------------------------------------------------
-- 4. TICKET VALIDATION (driver scans QR or types the ticket number)
--    p_confirm = false → preview only.  p_confirm = true → mark boarded.
-- ---------------------------------------------------------------------
create or replace function public.tc_validate_ticket(p_code text, p_confirm boolean default false)
returns json language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_code text := upper(btrim(coalesce(p_code, '')));
  r record;
  v_updated int;
begin
  if v_uid is null then raise exception 'Please sign in first.'; end if;
  select role into v_role from public.profiles where id = v_uid;
  if v_role is null or v_role not in ('driver', 'admin') then
    raise exception 'Only drivers can validate tickets.';
  end if;

  if v_code = '' then
    return json_build_object('result', 'invalid', 'message', 'Enter or scan a ticket code.');
  end if;

  select tk.id as ticket_id, tk.ticket_code, tk.status as ticket_status, tk.used_at,
         b.id as booking_id, b.status as booking_status, b.seat_number, b.passenger_id,
         t.id as trip_id, t.trip_code, t.status as trip_status, t.driver_id,
         rt.origin, rt.destination,
         pp.full_name as passenger_name
  into r
  from public.tickets tk
  join public.bookings b on b.id = tk.booking_id
  join public.trips t on t.id = b.trip_id
  left join public.routes rt on rt.id = t.route_id
  left join public.profiles pp on pp.id = b.passenger_id
  where tk.ticket_code = v_code;

  if not found then
    return json_build_object('result', 'invalid', 'message', 'No ticket with this code exists.');
  end if;

  if v_role = 'driver' and r.driver_id is distinct from v_uid then
    return json_build_object('result', 'wrong_trip', 'trip_code', r.trip_code,
      'message', 'This ticket is for trip ' || coalesce(r.trip_code, '—') || ', not your trip.');
  end if;

  if r.ticket_status = 'cancelled' or r.booking_status = 'cancelled' then
    return json_build_object('result', 'cancelled', 'message', 'This ticket has been cancelled.');
  end if;

  if r.trip_status in ('completed', 'cancelled') then
    return json_build_object('result', 'trip_ended', 'trip_code', r.trip_code,
      'message', 'Trip ' || coalesce(r.trip_code, '—') || ' has already ended.');
  end if;

  if r.ticket_status = 'used' then
    return json_build_object('result', 'used', 'used_at', r.used_at, 'seat', r.seat_number,
      'message', 'Ticket already used.');
  end if;

  if p_confirm then
    update public.tickets set status = 'used', used_at = now()
    where id = r.ticket_id and status not in ('used', 'cancelled');
    get diagnostics v_updated = row_count;
    if v_updated = 0 then
      return json_build_object('result', 'used', 'message', 'Ticket already used.');
    end if;
    update public.bookings set status = 'boarded' where id = r.booking_id;
    begin
      insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
      values (v_uid, 'ticket_scanned', 'ticket', r.ticket_id,
              json_build_object('booking_id', r.booking_id)::jsonb);
    exception when others then null;
    end;
  end if;

  return json_build_object(
    'result', case when p_confirm then 'boarded' else 'valid' end,
    'message', case when p_confirm then 'Passenger boarded.' else 'Valid ticket.' end,
    'ticket_code', r.ticket_code, 'seat', r.seat_number, 'trip_code', r.trip_code,
    'passenger', coalesce(r.passenger_name, 'Passenger'),
    'route', coalesce(r.origin, '?') || ' → ' || coalesce(r.destination, '?')
  );
end $$;

-- ---------------------------------------------------------------------
-- 5. CANCEL A TRIP (driver of the trip, owning operator, or admin)
-- ---------------------------------------------------------------------
create or replace function public.tc_cancel_trip(p_trip_id uuid, p_reason text default null)
returns json language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_uid uuid := auth.uid();
  v_trip record;
  v_op public.profiles.operator_id%type := public.tc_my_operator_id();
  v_allowed boolean := false;
  v_count int := 0;
  v_pax record;
begin
  if v_uid is null then raise exception 'Please sign in first.'; end if;

  select t.id, t.trip_code, t.status, t.driver_id, v.operator_id as vehicle_operator
  into v_trip
  from public.trips t left join public.vehicles v on v.id = t.vehicle_id
  where t.id = p_trip_id;
  if not found then raise exception 'Trip not found.'; end if;

  v_allowed := v_trip.driver_id = v_uid
    or public.tc_is_admin()
    or (v_op is not null and v_trip.vehicle_operator = v_op);
  if not v_allowed then raise exception 'You are not allowed to cancel this trip.'; end if;

  if v_trip.status not in ('scheduled', 'boarding') then
    raise exception 'Only trips that have not departed can be cancelled.';
  end if;

  update public.trips set status = 'cancelled' where id = p_trip_id;

  for v_pax in
    select b.id as booking_id, b.passenger_id
    from public.bookings b
    where b.trip_id = p_trip_id and b.status in ('reserved', 'boarded')
  loop
    v_count := v_count + 1;
    begin
      update public.bookings set status = 'cancelled' where id = v_pax.booking_id;
    exception when check_violation then null;
    end;
    begin
      update public.tickets set status = 'cancelled'
      where booking_id = v_pax.booking_id and status not in ('used', 'cancelled');
    exception when check_violation then null;
    end;
    if v_pax.passenger_id is not null then
      begin
        insert into public.notifications (recipient_id, title, message, type, related_entity, is_read)
        values (v_pax.passenger_id, 'Trip cancelled',
                'Trip ' || coalesce(v_trip.trip_code, '') || ' was cancelled.' ||
                  coalesce(' Reason: ' || nullif(btrim(p_reason), ''), ''),
                'trip_cancelled', p_trip_id, false);
      exception when others then null;
      end;
    end if;
  end loop;

  begin
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (v_uid, 'trip_cancelled', 'trip', p_trip_id,
            json_build_object('reason', p_reason, 'passengers', v_count)::jsonb);
  exception when others then null;
  end;

  return json_build_object('cancelled', true, 'passengers_notified', v_count);
end $$;

-- ---------------------------------------------------------------------
-- 6. ADMIN: DELETE A USER ACCOUNT (passenger, driver or operator)
-- ---------------------------------------------------------------------
-- Removes rows that still point at the account. Rows with an optional link
-- (nullable column) are kept and detached; rows that cannot exist without
-- the account are deleted, together with whatever depends on them.
create or replace function public.tc_purge_refs(p_tbl regclass, p_col text, p_vals text[], p_depth int default 0)
returns void language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare
  c record;
  v_child_col text;
  v_ref_col text;
  v_nullable boolean;
  v_vals text[];
begin
  if p_depth > 6 or p_vals is null or array_length(p_vals, 1) is null then return; end if;

  for c in
    select con.conrelid as child_oid, con.conkey[1] as child_attnum, con.confkey[1] as ref_attnum
    from pg_constraint con
    join pg_class cl on cl.oid = con.conrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where con.contype = 'f'
      and con.confrelid = p_tbl
      and array_length(con.conkey, 1) = 1
      and con.confdeltype in ('a', 'r')
      and n.nspname = 'public'
  loop
    select a.attname, not a.attnotnull into v_child_col, v_nullable
    from pg_attribute a where a.attrelid = c.child_oid and a.attnum = c.child_attnum;
    select a.attname into v_ref_col
    from pg_attribute a where a.attrelid = p_tbl and a.attnum = c.ref_attnum;

    execute format('select coalesce(array_agg(%I::text), ''{}''::text[]) from %s where %I::text = any($1)',
                   v_ref_col, p_tbl, p_col)
    into v_vals using p_vals;
    continue when array_length(v_vals, 1) is null;

    if v_nullable then
      execute format('update %s set %I = null where %I::text = any($1)',
                     c.child_oid::regclass, v_child_col, v_child_col) using v_vals;
    else
      perform public.tc_purge_refs(c.child_oid::regclass, v_child_col, v_vals, p_depth + 1);
      execute format('delete from %s where %I::text = any($1)',
                     c.child_oid::regclass, v_child_col) using v_vals;
    end if;
  end loop;
end $$;

create or replace function public.tc_admin_delete_user(p_user_id uuid)
returns json language plpgsql security definer
set search_path = public, auth, pg_temp as $$
declare
  v_target record;
  v_ids text[];
begin
  if not public.tc_is_admin() then
    raise exception 'Only administrators can delete accounts.';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account.';
  end if;

  select id, full_name, email, phone, role into v_target
  from public.profiles where id = p_user_id;

  if not found then
    if exists (select 1 from auth.users where id = p_user_id) then
      delete from auth.users where id = p_user_id;
      return json_build_object('deleted', true, 'role', null, 'name', null);
    end if;
    raise exception 'User not found.';
  end if;

  if v_target.role = 'admin' then
    raise exception 'Administrator accounts cannot be deleted here.';
  end if;

  if exists (select 1 from public.trips
             where driver_id = p_user_id and status in ('boarding', 'in_transit')) then
    raise exception 'This driver has a trip in progress. Wait until it ends.';
  end if;

  -- Upcoming trips of a driver are cancelled so passengers are told.
  perform public.tc_cancel_trip_system(t.id, 'The driver account was removed.')
  from public.trips t
  where t.driver_id = p_user_id and t.status = 'scheduled';

  -- A passenger's seats on trips that have not finished are released.
  select coalesce(array_agg(b.id::text), '{}'::text[]) into v_ids
  from public.bookings b join public.trips t on t.id = b.trip_id
  where b.passenger_id = p_user_id and t.status in ('scheduled', 'boarding', 'in_transit');
  if array_length(v_ids, 1) is not null then
    perform public.tc_purge_refs('public.bookings'::regclass, 'id', v_ids);
    delete from public.bookings where id::text = any(v_ids);
  end if;

  delete from public.notifications where recipient_id = p_user_id;

  begin
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'user_deleted', 'profile', p_user_id,
            json_build_object('name', v_target.full_name, 'email', v_target.email,
                              'role', v_target.role)::jsonb);
  exception when others then null;
  end;

  -- Detach / remove anything else that still points at the account.
  perform public.tc_purge_refs('auth.users'::regclass, 'id', array[p_user_id::text]);
  perform public.tc_purge_refs('public.profiles'::regclass, 'id', array[p_user_id::text]);

  delete from public.profiles where id = p_user_id;
  delete from auth.users where id = p_user_id;

  return json_build_object('deleted', true, 'role', v_target.role, 'name', v_target.full_name);
end $$;

-- internal: cancel a trip without a caller check (used only by the function above)
create or replace function public.tc_cancel_trip_system(p_trip_id uuid, p_reason text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_trip record; v_pax record;
begin
  select id, trip_code, status into v_trip from public.trips where id = p_trip_id;
  if not found or v_trip.status not in ('scheduled', 'boarding') then return; end if;
  update public.trips set status = 'cancelled' where id = p_trip_id;
  for v_pax in select b.id as booking_id, b.passenger_id from public.bookings b
               where b.trip_id = p_trip_id and b.status in ('reserved', 'boarded')
  loop
    begin update public.bookings set status = 'cancelled' where id = v_pax.booking_id;
    exception when check_violation then null; end;
    begin update public.tickets set status = 'cancelled'
          where booking_id = v_pax.booking_id and status not in ('used', 'cancelled');
    exception when check_violation then null; end;
    if v_pax.passenger_id is not null then
      begin
        insert into public.notifications (recipient_id, title, message, type, related_entity, is_read)
        values (v_pax.passenger_id, 'Trip cancelled',
                'Trip ' || coalesce(v_trip.trip_code, '') || ' was cancelled. ' || coalesce(p_reason, ''),
                'trip_cancelled', p_trip_id, false);
      exception when others then null; end;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 7. OPERATOR TOOLS
-- ---------------------------------------------------------------------
-- 7a. Every operator account gets (or is linked to) a company record.
create or replace function public.tc_ensure_operator_account()
returns public.profiles.operator_id%type language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_p record;
  v_id public.profiles.operator_id%type;
begin
  select * into v_p from public.profiles where id = auth.uid();
  if not found or v_p.role <> 'operator' then return null; end if;
  if v_p.operator_id is not null then return v_p.operator_id; end if;

  insert into public.operators (name, contact_name, phone, email, status)
  values (coalesce(nullif(btrim(v_p.full_name), ''), 'My company'),
          v_p.full_name, v_p.phone, v_p.email, 'active')
  returning id into v_id;

  update public.profiles set operator_id = v_id where id = v_p.id;
  return v_id;
end $$;

create or replace function public.tc_operator_company()
returns json language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v_op public.profiles.operator_id%type := public.tc_my_operator_id(); r json;
begin
  if v_op is null then return null; end if;
  select row_to_json(o) into r from public.operators o where o.id = v_op;
  return r;
end $$;

create or replace function public.tc_operator_update_company(
  p_name text, p_contact text, p_phone text, p_email text)
returns json language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_op public.profiles.operator_id%type := public.tc_my_operator_id();
begin
  if v_op is null then raise exception 'Your account is not linked to an operator company.'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Company name is required.'; end if;
  update public.operators
  set name = btrim(p_name),
      contact_name = nullif(btrim(coalesce(p_contact, '')), ''),
      phone = nullif(btrim(coalesce(p_phone, '')), ''),
      email = nullif(btrim(coalesce(p_email, '')), '')
  where id = v_op;
  return public.tc_operator_company();
end $$;

-- 7b. Dashboard numbers
create or replace function public.tc_operator_dashboard()
returns json language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_op public.profiles.operator_id%type := public.tc_my_operator_id();
  v_today date := (now() at time zone 'Africa/Lagos')::date;
  r json;
begin
  if v_op is null then raise exception 'Your account is not linked to an operator company.'; end if;
  select json_build_object(
    'vehicles', (select count(*) from public.vehicles where operator_id = v_op),
    'vehicles_active', (select count(*) from public.vehicles where operator_id = v_op and coalesce(status, 'active') = 'active'),
    'drivers', (select count(*) from public.profiles where operator_id = v_op and role = 'driver'),
    'trips_total', (select count(*) from public.trips t join public.vehicles v on v.id = t.vehicle_id where v.operator_id = v_op),
    'trips_today', (select count(*) from public.trips t join public.vehicles v on v.id = t.vehicle_id
                    where v.operator_id = v_op and (t.planned_departure at time zone 'Africa/Lagos')::date = v_today and t.status <> 'cancelled'),
    'trips_upcoming', (select count(*) from public.trips t join public.vehicles v on v.id = t.vehicle_id
                       where v.operator_id = v_op and t.status in ('scheduled', 'boarding')),
    'trips_active', (select count(*) from public.trips t join public.vehicles v on v.id = t.vehicle_id
                     where v.operator_id = v_op and t.status = 'in_transit'),
    'bookings_total', (select count(*) from public.bookings b join public.trips t on t.id = b.trip_id
                       join public.vehicles v on v.id = t.vehicle_id
                       where v.operator_id = v_op and b.status in ('reserved', 'boarded', 'completed')),
    'revenue_total', coalesce((select sum(b.fare) from public.bookings b join public.trips t on t.id = b.trip_id
                       join public.vehicles v on v.id = t.vehicle_id
                       where v.operator_id = v_op and b.status in ('reserved', 'boarded', 'completed')), 0),
    'revenue_month', coalesce((select sum(b.fare) from public.bookings b join public.trips t on t.id = b.trip_id
                       join public.vehicles v on v.id = t.vehicle_id
                       where v.operator_id = v_op and b.status in ('reserved', 'boarded', 'completed')
                         and date_trunc('month', t.planned_departure at time zone 'Africa/Lagos')
                           = date_trunc('month', now() at time zone 'Africa/Lagos')), 0)
  ) into r;
  return r;
end $$;

-- 7c. Vehicles
create or replace function public.tc_operator_vehicles()
returns json language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v_op public.profiles.operator_id%type := public.tc_my_operator_id(); r json;
begin
  if v_op is null then raise exception 'Your account is not linked to an operator company.'; end if;
  select coalesce(json_agg(x order by x.registration_number), '[]'::json) into r
  from (
    select v.id, v.registration_number, v.vehicle_type, v.capacity, v.status,
           v.assigned_driver_id, d.full_name as driver_name,
           (select count(*) from public.trips t where t.vehicle_id = v.id
             and t.status in ('scheduled', 'boarding', 'in_transit')) as open_trips
    from public.vehicles v left join public.profiles d on d.id = v.assigned_driver_id
    where v.operator_id = v_op
  ) x;
  return r;
end $$;

create or replace function public.tc_operator_save_vehicle(
  p_id uuid, p_registration text, p_type text, p_capacity int, p_status text)
returns json language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_op public.profiles.operator_id%type := public.tc_my_operator_id();
  v_reg text := upper(btrim(coalesce(p_registration, '')));
  v_status text := coalesce(nullif(btrim(p_status), ''), 'active');
  v_id uuid;
begin
  if v_op is null then raise exception 'Your account is not linked to an operator company.'; end if;
  if v_reg = '' then raise exception 'Registration number is required.'; end if;
  if p_capacity is null or p_capacity < 1 or p_capacity > 100 then
    raise exception 'Capacity must be between 1 and 100 seats.';
  end if;
  if v_status not in ('active', 'inactive', 'maintenance') then
    raise exception 'Invalid vehicle status.';
  end if;
  if exists (select 1 from public.vehicles where upper(registration_number) = v_reg
             and id is distinct from p_id) then
    raise exception 'A vehicle with registration % already exists.', v_reg;
  end if;

  if p_id is null then
    insert into public.vehicles (registration_number, vehicle_type, capacity, status,
                                 verification_status, operator_id)
    values (v_reg, nullif(btrim(coalesce(p_type, '')), ''), p_capacity, v_status, 'verified', v_op)
    returning id into v_id;
  else
    update public.vehicles
    set registration_number = v_reg,
        vehicle_type = nullif(btrim(coalesce(p_type, '')), ''),
        capacity = p_capacity, status = v_status
    where id = p_id and operator_id = v_op
    returning id into v_id;
    if v_id is null then raise exception 'Vehicle not found.'; end if;
  end if;
  return json_build_object('id', v_id);
end $$;

create or replace function public.tc_operator_delete_vehicle(p_id uuid)
returns json language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_op public.profiles.operator_id%type := public.tc_my_operator_id();
begin
  if v_op is null then raise exception 'Your account is not linked to an operator company.'; end if;
  if not exists (select 1 from public.vehicles where id = p_id and operator_id = v_op) then
    raise exception 'Vehicle not found.';
  end if;
  if exists (select 1 from public.trips where vehicle_id = p_id and status in ('scheduled', 'boarding', 'in_transit')) then
    raise exception 'This vehicle has upcoming or active trips. Cancel them first.';
  end if;
  update public.vehicles set assigned_driver_id = null where id = p_id;
  if exists (select 1 from public.trips where vehicle_id = p_id) then
    update public.vehicles set status = 'inactive' where id = p_id;
    return json_build_object('archived', true);
  end if;
  delete from public.vehicles where id = p_id;
  return json_build_object('deleted', true);
end $$;

create or replace function public.tc_operator_assign_vehicle(p_vehicle_id uuid, p_driver_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_op public.profiles.operator_id%type := public.tc_my_operator_id();
begin
  if v_op is null then raise exception 'Your account is not linked to an operator company.'; end if;
  if not exists (select 1 from public.vehicles where id = p_vehicle_id and operator_id = v_op) then
    raise exception 'Vehicle not found.';
  end if;
  if p_driver_id is not null then
    if not exists (select 1 from public.profiles where id = p_driver_id and role = 'driver' and operator_id = v_op) then
      raise exception 'That driver is not part of your company.';
    end if;
    update public.vehicles set assigned_driver_id = null
    where assigned_driver_id = p_driver_id and id <> p_vehicle_id;
  end if;
  update public.vehicles set assigned_driver_id = p_driver_id where id = p_vehicle_id;
end $$;

-- 7d. Drivers
create or replace function public.tc_operator_drivers()
returns json language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v_op public.profiles.operator_id%type := public.tc_my_operator_id(); r json;
begin
  if v_op is null then raise exception 'Your account is not linked to an operator company.'; end if;
  select coalesce(json_agg(x order by x.full_name), '[]'::json) into r
  from (
    select p.id, p.full_name, p.email, p.phone, p.status,
           (select v.registration_number from public.vehicles v where v.assigned_driver_id = p.id limit 1) as vehicle
    from public.profiles p where p.operator_id = v_op and p.role = 'driver'
  ) x;
  return r;
end $$;

create or replace function public.tc_operator_add_driver(p_identifier text)
returns json language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_op public.profiles.operator_id%type := public.tc_my_operator_id();
  v_in text := btrim(coalesce(p_identifier, ''));
  v_digits text := right(regexp_replace(v_in, '\D', '', 'g'), 10);
  v_d record;
begin
  if v_op is null then raise exception 'Your account is not linked to an operator company.'; end if;
  if v_in = '' then raise exception 'Enter the driver''s email or phone number.'; end if;

  if position('@' in v_in) > 0 then
    select id, full_name, operator_id into v_d from public.profiles
    where role = 'driver' and lower(email) = lower(v_in) limit 1;
  else
    if length(v_digits) < 10 then raise exception 'Enter a valid phone number.'; end if;
    select id, full_name, operator_id into v_d from public.profiles
    where role = 'driver' and right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 10) = v_digits limit 1;
  end if;

  if not found then
    raise exception 'No driver account found. The driver must register first (Create account → Driver).';
  end if;
  if v_d.operator_id is not null and v_d.operator_id <> v_op then
    raise exception 'This driver already belongs to another operator.';
  end if;

  update public.profiles set operator_id = v_op where id = v_d.id;
  return json_build_object('id', v_d.id, 'name', v_d.full_name);
end $$;

create or replace function public.tc_operator_remove_driver(p_driver_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_op public.profiles.operator_id%type := public.tc_my_operator_id();
begin
  if v_op is null then raise exception 'Your account is not linked to an operator company.'; end if;
  if not exists (select 1 from public.profiles where id = p_driver_id and operator_id = v_op and role = 'driver') then
    raise exception 'Driver not found in your company.';
  end if;
  if exists (select 1 from public.trips where driver_id = p_driver_id and status in ('boarding', 'in_transit')) then
    raise exception 'This driver has a trip in progress.';
  end if;
  update public.vehicles set assigned_driver_id = null where assigned_driver_id = p_driver_id and operator_id = v_op;
  update public.profiles set operator_id = null where id = p_driver_id;
end $$;

-- 7e. Trips
create or replace function public.tc_operator_trips(p_limit int default 100)
returns json language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v_op public.profiles.operator_id%type := public.tc_my_operator_id(); r json;
begin
  if v_op is null then raise exception 'Your account is not linked to an operator company.'; end if;
  select coalesce(json_agg(x order by x.planned_departure desc), '[]'::json) into r
  from (
    select t.id, t.trip_code, t.status, t.planned_departure, t.actual_departure,
           rt.origin, rt.destination, v.registration_number, v.capacity,
           d.full_name as driver_name,
           (select count(*) from public.bookings b where b.trip_id = t.id and b.status in ('reserved', 'boarded', 'completed')) as booked,
           (select count(*) from public.bookings b where b.trip_id = t.id and b.status = 'boarded') as boarded,
           coalesce((select sum(b.fare) from public.bookings b where b.trip_id = t.id and b.status in ('reserved', 'boarded', 'completed')), 0) as revenue
    from public.trips t
    join public.vehicles v on v.id = t.vehicle_id
    left join public.routes rt on rt.id = t.route_id
    left join public.profiles d on d.id = t.driver_id
    where v.operator_id = v_op
    order by t.planned_departure desc
    limit greatest(1, least(coalesce(p_limit, 100), 500))
  ) x;
  return r;
end $$;

create or replace function public.tc_operator_trip_passengers(p_trip_id uuid)
returns json language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare v_op public.profiles.operator_id%type := public.tc_my_operator_id(); r json;
begin
  if v_op is null then raise exception 'Your account is not linked to an operator company.'; end if;
  if not exists (select 1 from public.trips t join public.vehicles v on v.id = t.vehicle_id
                 where t.id = p_trip_id and v.operator_id = v_op) then
    raise exception 'Trip not found.';
  end if;
  select coalesce(json_agg(x order by x.seat_number), '[]'::json) into r
  from (
    select b.seat_number, b.status, b.fare,
           coalesce(p.full_name, 'Former passenger') as passenger, p.phone
    from public.bookings b left join public.profiles p on p.id = b.passenger_id
    where b.trip_id = p_trip_id and b.status <> 'cancelled'
  ) x;
  return r;
end $$;

create or replace function public.tc_operator_schedule_trip(
  p_vehicle_id uuid, p_route_id uuid, p_terminal_id uuid, p_departure timestamptz)
returns json language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_op public.profiles.operator_id%type := public.tc_my_operator_id();
  v_veh record;
  v_driver record;
  v_id uuid;
  v_code text;
begin
  if v_op is null then raise exception 'Your account is not linked to an operator company.'; end if;
  select id, status, assigned_driver_id into v_veh from public.vehicles
  where id = p_vehicle_id and operator_id = v_op;
  if not found then raise exception 'Vehicle not found.'; end if;
  if coalesce(v_veh.status, 'active') <> 'active' then
    raise exception 'This vehicle is not active.';
  end if;
  if v_veh.assigned_driver_id is null then
    raise exception 'Assign a driver to this vehicle first.';
  end if;
  select id, status into v_driver from public.profiles where id = v_veh.assigned_driver_id;
  if v_driver.status is distinct from 'approved' then
    raise exception 'The assigned driver has not been approved by an administrator yet.';
  end if;
  if not exists (select 1 from public.routes where id = p_route_id) then
    raise exception 'Choose a route.';
  end if;
  if p_departure is null or p_departure < now() - interval '5 minutes' then
    raise exception 'Departure time must be in the future.';
  end if;
  if exists (select 1 from public.trips t where t.vehicle_id = p_vehicle_id
             and t.status in ('scheduled', 'boarding', 'in_transit')
             and abs(extract(epoch from (t.planned_departure - p_departure))) < 3600) then
    raise exception 'This vehicle already has a trip within an hour of that time.';
  end if;

  v_code := public.tc_new_trip_code();
  insert into public.trips (trip_code, driver_id, vehicle_id, route_id, terminal_id, planned_departure, status)
  values (v_code, v_driver.id, p_vehicle_id, p_route_id, p_terminal_id, p_departure, 'scheduled')
  returning id into v_id;

  begin
    insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
    values (auth.uid(), 'trip_created', 'trip', v_id, json_build_object('by', 'operator')::jsonb);
  exception when others then null;
  end;
  return json_build_object('id', v_id, 'trip_code', v_code);
end $$;

-- 7f. Revenue report (dates are Lagos dates, both ends included)
create or replace function public.tc_operator_revenue(p_from date, p_to date)
returns json language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_op public.profiles.operator_id%type := public.tc_my_operator_id();
  v_from date := coalesce(p_from, (now() at time zone 'Africa/Lagos')::date - 29);
  v_to date := coalesce(p_to, (now() at time zone 'Africa/Lagos')::date);
  r json;
begin
  if v_op is null then raise exception 'Your account is not linked to an operator company.'; end if;
  if v_to < v_from then raise exception 'The end date is before the start date.'; end if;
  if v_to - v_from > 366 then raise exception 'Choose a range of one year or less.'; end if;

  with base as (
    select t.id as trip_id, t.status as trip_status,
           (t.planned_departure at time zone 'Africa/Lagos')::date as day,
           rt.origin, rt.destination, v.registration_number,
           b.id as booking_id, b.fare
    from public.trips t
    join public.vehicles v on v.id = t.vehicle_id
    left join public.routes rt on rt.id = t.route_id
    left join public.bookings b on b.trip_id = t.id and b.status in ('reserved', 'boarded', 'completed')
    where v.operator_id = v_op
      and (t.planned_departure at time zone 'Africa/Lagos')::date between v_from and v_to
      and t.status <> 'cancelled'
  )
  select json_build_object(
    'from', v_from, 'to', v_to,
    'trips', (select count(distinct trip_id) from base),
    'bookings', (select count(booking_id) from base),
    'revenue', coalesce((select sum(fare) from base), 0),
    'by_route', coalesce((select json_agg(x order by x.revenue desc) from (
        select coalesce(origin, '?') || ' → ' || coalesce(destination, '?') as label,
               count(booking_id) as bookings, coalesce(sum(fare), 0) as revenue
        from base group by 1) x), '[]'::json),
    'by_vehicle', coalesce((select json_agg(x order by x.revenue desc) from (
        select registration_number as label, count(booking_id) as bookings,
               coalesce(sum(fare), 0) as revenue
        from base group by 1) x), '[]'::json),
    'by_day', coalesce((select json_agg(x order by x.day) from (
        select day, count(booking_id) as bookings, coalesce(sum(fare), 0) as revenue
        from base group by 1) x), '[]'::json)
  ) into r;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 8. Permissions: signed-in users may call the functions; only the share
--    viewer function is open to visitors who are not signed in.
-- ---------------------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname like 'tc\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated', r.sig);
    if r.proname not in ('tc_purge_refs', 'tc_cancel_trip_system', 'tc_new_trip_code') then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end $$;
grant execute on function public.tc_get_trip_share(text) to anon, authenticated;

-- Make the API notice the new functions straight away.
notify pgrst, 'reload schema';
