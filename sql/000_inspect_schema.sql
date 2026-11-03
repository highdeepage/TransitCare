-- =====================================================================
-- READ-ONLY. Safe to run any time. Changes nothing.
-- Run in Supabase → SQL Editor, then send me the results if anything in
-- the update misbehaves. It shows the real tables, RLS state, policies,
-- triggers and duplicate rows, so nothing has to be guessed.
-- =====================================================================

-- 1. Tables and whether Row Level Security is ON
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;

-- 2. Columns of the tables the app uses
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name in ('profiles','operators','vehicles','routes','terminals','trips',
                     'bookings','tickets','notifications','feedback','trip_locations',
                     'audit_logs','news_updates','trip_shares')
order by table_name, ordinal_position;

-- 3. Existing Row Level Security policies
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies where schemaname = 'public' order by tablename, policyname;

-- 4. Triggers on auth.users (a trigger that also creates profiles would conflict
--    with the app's own profile creation; the app tolerates it, but it is good to know)
select tgname, tgrelid::regclass as on_table, pg_get_triggerdef(oid) as definition
from pg_trigger where not tgisinternal and tgrelid in ('auth.users'::regclass);

-- 5. Duplicate profiles / codes (all of these should return zero rows)
select id, count(*) from public.profiles group by id having count(*) > 1;
select email, count(*) from public.profiles where email is not null group by email having count(*) > 1;
select trip_code, count(*) from public.trips group by trip_code having count(*) > 1;
select ticket_code, count(*) from public.tickets group by ticket_code having count(*) > 1;

-- 6. Auth users that have no profile yet (the app creates the profile at first sign-in)
select u.id, u.email, u.phone, u.created_at
from auth.users u left join public.profiles p on p.id = u.id
where p.id is null order by u.created_at desc limit 50;
