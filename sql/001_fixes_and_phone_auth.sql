-- =========================================================
-- Eko TransitCare — run once in the Supabase SQL editor
-- =========================================================

-- 1. Prevent double-booking a seat (race condition in completeBooking).
--    If this fails with a duplicate-key error, you already have two active
--    bookings for the same seat; cancel/release one first, then re-run.
create unique index if not exists bookings_active_seat_unique
  on public.bookings (trip_id, seat_number)
  where status in ('reserved', 'boarded');

-- 2. Phone (WhatsApp) sign-ups have no email address.
alter table public.profiles alter column email drop not null;

-- 3. OPTIONAL — let the sign-in page read public news for the hero ticker.
--    Only run if news_updates already has RLS enabled and your admin policy
--    lets admins see hidden rows too (this adds a read policy, nothing else).
-- create policy "news_public_read" on public.news_updates
--   for select to anon, authenticated using (is_active = true);

-- 4. RECOMMENDED — stop users choosing their own role.
--    The client now only self-assigns passenger/driver/operator, but the
--    real guard must be in the database. Make sure your profiles INSERT/UPDATE
--    policies (or a trigger) reject role = 'admin' unless the caller is an admin.

-- 5. Live tracking: make sure Realtime is enabled for these tables so the
--    passenger's map and trip status update without refreshing.
--    (If a line errors with "already member of publication", that is fine.)
alter publication supabase_realtime add table public.trip_locations;
alter publication supabase_realtime add table public.trips;
