-- Clear all guest profiles, reservation links, and reservations in `hotel` schema.
-- Use when you want a clean slate for operational/demo data (re-seed with seed.firefly.sql after).
--
-- Run (service role / postgres recommended — bypasses RLS):
--   psql $DATABASE_URL -f supabase/clear_hotel_guests_reservations.sql
--   or paste into Supabase SQL Editor and execute.
--
-- Does NOT touch: public.tenants, hotel.memberships, hotel.profiles, etc.
-- Room keys: after clearing stays, keys still marked `occupied` are reset to vacant clean
-- so inventory matches the empty reservation ledger (see optional blocks for other scopes).

begin;

-- 1) Guest–stay links (safe to run even if you later add FK quirks)
delete from hotel.reservation_guests;

-- 2) All reservations (all tenants)
delete from hotel.reservations;

-- 3) All guest profiles (all tenants)
delete from hotel.guests;

-- 4) Drop stale “occupied” flags on physical keys (reservations no longer justify occupancy)
update hotel.room_units
set status = 'vacant_clean'
where status = 'occupied';

commit;

-- =============================================================================
-- OPTIONAL: only clear data for one tenant (e.g. Firefly demo)
-- =============================================================================
-- begin;
-- delete from hotel.reservation_guests
-- where reservation_id in (select id from hotel.reservations where tenant_id = '41604dc6-9ce1-49bd-a0bb-5aa777ec7463');
-- delete from hotel.reservations where tenant_id = '41604dc6-9ce1-49bd-a0bb-5aa777ec7463';
-- delete from hotel.guests where tenant_id = '41604dc6-9ce1-49bd-a0bb-5aa777ec7463';
-- update hotel.room_units
-- set status = 'vacant_clean'
-- where tenant_id = '41604dc6-9ce1-49bd-a0bb-5aa777ec7463' and status = 'occupied';
-- commit;

-- =============================================================================
-- OPTIONAL: reset every physical key to vacant/clean (all statuses → vacant_clean)
-- =============================================================================
-- begin;
-- update hotel.room_units
-- set status = 'vacant_clean', notes = null;
-- commit;
