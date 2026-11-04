-- =====================================================================
-- Eko TransitCare — 003_secure_new_user.sql
-- Run ONCE in Supabase → SQL Editor (paste the TEXT of this file, not its name).
-- Safe to run again.
--
-- Fixes a security hole in handle_new_user(): it copied the "role" typed into
-- the sign-up data without checking it, so anyone calling Supabase directly
-- could register as role = 'admin'.
--
-- After this:
--   * only passenger / driver / operator can be self-assigned; anything else = passenger
--   * Google and phone sign-ups are always passengers
--   * drivers still start as email_verified (admin approval needed); others start active
--   * a signed-in user can no longer change their OWN role, status or company;
--     only an admin (or the app's database functions) can.
-- =====================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  meta_role   text;
  meta_status text;
  provider    text;
  is_phone_only boolean;
begin
  provider      := coalesce(new.raw_app_meta_data->>'provider', 'email');
  is_phone_only := (new.email is null and new.phone is not null);

  meta_role := lower(coalesce(new.raw_user_meta_data->>'role', 'passenger'));

  -- Only these roles may be chosen at sign-up. 'admin' (or anything unknown) is never allowed.
  if meta_role not in ('passenger', 'driver', 'operator') then
    meta_role := 'passenger';
  end if;

  -- Google / phone sign-ups cannot become drivers or operators.
  if provider <> 'email' or is_phone_only then
    meta_role := 'passenger';
  end if;

  -- Drivers begin in `email_verified` (they still need admin approval).
  if meta_role = 'driver' then
    meta_status := 'email_verified';
  else
    meta_status := 'active';
  end if;

  insert into public.profiles (id, full_name, email, phone, role, status)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''),
             nullif(new.raw_user_meta_data->>'name', ''),
             nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
             new.phone),
    new.email,
    coalesce(nullif(new.raw_user_meta_data->>'phone', ''), new.phone),
    meta_role,
    meta_status
  )
  on conflict (id) do nothing;

  return new;
end;
$function$;

-- Used by the guard below (same definition as in 002; safe to repeat).
create or replace function public.tc_is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin' and coalesce(p.status, 'active') = 'active');
$$;

-- A signed-in user (the app / browser) may not change role, status or company of an account
-- unless they are an admin. Database functions and the SQL editor are not affected.
create or replace function public.tc_guard_profile_update()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if (new.role        is distinct from old.role
     or new.status      is distinct from old.status
     or new.operator_id is distinct from old.operator_id)
       and not public.tc_is_admin() then
      raise exception 'You are not allowed to change role, status or company on an account.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tc_guard_profile_update on public.profiles;
create trigger tc_guard_profile_update
  before update on public.profiles
  for each row execute function public.tc_guard_profile_update();

-- ---------------------------------------------------------------------
-- CHECK (read-only): any account that is already an admin. Make sure every
-- row here is really yours. If you see one you do not recognise, tell me.
-- ---------------------------------------------------------------------
select id, full_name, email, role, status, created_at
from public.profiles where role = 'admin' order by created_at;
