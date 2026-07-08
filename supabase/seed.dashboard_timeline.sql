-- Dashboard-friendly timeline data for Firefly (tenant 41604dc6-9ce1-49bd-a0bb-5aa777ec7463).
-- SUPERSEDED: use `npm run seed:demo -- firefly` instead. Do not combine with TS seed without clearing first.
-- Uses UTC dates relative to now() so "arrivals today", revenue today, and occupancy trend stay fresh.
-- Safe to re-run: removes only rows with confirmation_code LIKE 'XYV-D-%' (demo overlay).
--
-- Tuned for ~71 physical keys (see seed.firefly.sql): more synthetic checked-out stays per month and
-- wider room_unit rotation so occupancy % and revenue "today" read well on the live dashboard.
--
-- What this feeds (see src/lib/hms/dashboard-metrics.ts):
--   • Arrivals / departures "today" = UTC calendar day on arrival_at / departure_at
--   • Revenue today = sum(rate_per_night) for checked_in where checked_in_at is today UTC
--   • Occupancy chart = last 8 UTC months, non-cancelled reservation overlaps vs room capacity
--   • No-shows / cancellations windows per dashboard logic
--
-- Prereq: base seed (seed.firefly.sql) so guest b000...001 and room UUIDs exist.

begin;

delete from hotel.reservation_guests
where reservation_id in (
  select id from hotel.reservations
  where tenant_id = '41604dc6-9ce1-49bd-a0bb-5aa777ec7463'
    and confirmation_code like 'XYV-D-%'
);

delete from hotel.reservations
where tenant_id = '41604dc6-9ce1-49bd-a0bb-5aa777ec7463'
  and confirmation_code like 'XYV-D-%';

do $$
declare
  tid uuid := '41604dc6-9ce1-49bd-a0bb-5aa777ec7463';
  gid uuid := 'b0000001-0000-4000-8000-000000000001'::uuid;
  seq int := 40000;
  rid uuid;
  d0 date := (timezone('utc', now()))::date;
  t0 timestamptz := (d0::timestamp at time zone 'UTC');
  mo int;
  k int;
  ms timestamptz;
  me timestamptz;
  arr timestamptz;
  dep timestamptz;
  rmid uuid;
  nts int;
  rpn numeric;
  chg numeric;
begin
  -- --- Today (UTC): pending arrivals, check-ins (revenue), departures today, no-show, cancellation ---
  insert into hotel.reservations (
    id, tenant_id, confirmation_code, status, arrival_at, departure_at, nights, adults, children_json,
    purpose_of_visit, room_type_code, room_unit_id, rate_type, season_code, rate_per_night, total_room_charges,
    settlement_method, market_segment, source, folio_number, registration_number,
    checked_in_at, checked_out_at, digital_key_issued, created_at
  ) values
  (
    'e0000001-0000-4000-8000-000000000001', tid, 'XYV-D-30001', 'confirmed',
    t0 + interval '13 hours', t0 + interval '4 days' + interval '11 hours', 4, 2, '[{"age":8}]'::jsonb,
    'leisure', 'STD', null, 'rack', 'peak', 48000.00, 192000.00,
    'cash', 'transient', 'website', 'XYV-F-D30001', 'XYV-R-D30001',
    null, null, false, timezone('utc', now()) - interval '5 days'
  ),
  (
    'e0000001-0000-4000-8000-000000000002', tid, 'XYV-D-30002', 'confirmed',
    t0 + interval '15 hours', t0 + interval '3 days' + interval '10 hours', 3, 1, '[]'::jsonb,
    'business', 'DLX', null, 'corporate', 'peak', 72000.00, 216000.00,
    'card', 'corporate', 'website', 'XYV-F-D30002', 'XYV-R-D30002',
    null, null, false, timezone('utc', now()) - interval '4 days'
  ),
  (
    'e0000001-0000-4000-8000-000000000003', tid, 'XYV-D-30003', 'checked_in',
    t0 + interval '10 hours', t0 + interval '5 days' + interval '10 hours', 5, 2, '[{"age":5}]'::jsonb,
    'leisure', 'STD', 'a0000001-0000-4000-8000-000000000005', 'rack', 'peak', 65000.00, 325000.00,
    'card', 'transient', 'ota', 'XYV-F-D30003', 'XYV-R-D30003',
    t0 + interval '10 hours 25 minutes', null, true, timezone('utc', now()) - interval '3 days'
  ),
  (
    'e0000001-0000-4000-8000-000000000004', tid, 'XYV-D-30004', 'checked_in',
    t0 + interval '11 hours', t0 + interval '4 days' + interval '9 hours', 4, 1, '[]'::jsonb,
    'business', 'DLX', 'a0000001-0000-4000-8000-00000000000c', 'corporate', 'peak', 78000.00, 312000.00,
    'card', 'corporate', 'website', 'XYV-F-D30004', 'XYV-R-D30004',
    t0 + interval '11 hours 10 minutes', null, true, timezone('utc', now()) - interval '3 days'
  ),
  (
    'e0000001-0000-4000-8000-000000000005', tid, 'XYV-D-30005', 'checked_in',
    t0 - interval '3 days', t0 + interval '10 hours', 4, 2, '[]'::jsonb,
    'business', 'STD', 'a0000001-0000-4000-8000-00000000000d', 'rack', 'shoulder', 52000.00, 208000.00,
    'cash', 'transient', 'walk_in', 'XYV-F-D30005', 'XYV-R-D30005',
    t0 - interval '3 days' + interval '2 hours', null, true, timezone('utc', now()) - interval '8 days'
  ),
  (
    'e0000001-0000-4000-8000-000000000006', tid, 'XYV-D-30006', 'checked_in',
    t0 - interval '2 days', t0 + interval '11 hours', 3, 1, '[]'::jsonb,
    'transit', 'STD', 'a0000001-0000-4000-8000-000000000017', 'walk_in_bar', 'peak', 55000.00, 165000.00,
    'cash', 'transient', 'walk_in', 'XYV-F-D30006', 'XYV-R-D30006',
    t0 - interval '2 days' + interval '1 hour', null, false, timezone('utc', now()) - interval '6 days'
  ),
  (
    'e0000001-0000-4000-8000-000000000007', tid, 'XYV-D-30007', 'no_show',
    t0 - interval '2 days', t0 - interval '1 day', 1, 1, '[]'::jsonb,
    'leisure', 'STD', null, 'rack', 'shoulder', 50000.00, 50000.00,
    'card', 'transient', 'ota', 'XYV-F-D30007', 'XYV-R-D30007',
    null, null, false, timezone('utc', now()) - interval '10 days'
  ),
  (
    'e0000001-0000-4000-8000-000000000008', tid, 'XYV-D-30008', 'cancelled',
    t0 - interval '18 days', t0 - interval '15 days', 3, 2, '[]'::jsonb,
    'leisure', 'DLX', null, 'promotional', 'shoulder', 61000.00, 183000.00,
    'card', 'transient', 'ota', 'XYV-F-D30008', 'XYV-R-D30008',
    null, null, false, timezone('utc', now()) - interval '22 days'
  ),
  (
    'e0000001-0000-4000-8000-000000000009', tid, 'XYV-D-30009', 'checked_in',
    t0 + interval '8 hours', t0 + interval '6 days' + interval '10 hours', 6, 2, '[]'::jsonb,
    'leisure', 'STE', 'a0000001-0000-4000-8000-000000000037', 'rack', 'peak', 95000.00, 570000.00,
    'card', 'transient', 'website', 'XYV-F-D30009', 'XYV-R-D30009',
    t0 + interval '8 hours 20 minutes', null, true, timezone('utc', now()) - interval '2 days'
  ),
  (
    'e0000001-0000-4000-8000-00000000000a', tid, 'XYV-D-30010', 'checked_in',
    t0 + interval '9 hours', t0 + interval '3 days' + interval '10 hours', 3, 1, '[{"age":9}]'::jsonb,
    'business', 'DLX', 'a0000001-0000-4000-8000-00000000002e', 'corporate', 'peak', 82000.00, 246000.00,
    'card', 'corporate', 'ota', 'XYV-F-D30010', 'XYV-R-D30010',
    t0 + interval '9 hours 5 minutes', null, true, timezone('utc', now()) - interval '2 days'
  ),
  (
    'e0000001-0000-4000-8000-00000000000b', tid, 'XYV-D-30011', 'checked_in',
    t0 + interval '14 hours', t0 + interval '2 days' + interval '11 hours', 2, 2, '[]'::jsonb,
    'leisure', 'STD', 'a0000001-0000-4000-8000-00000000001d', 'rack', 'peak', 48000.00, 96000.00,
    'cash', 'transient', 'walk_in', 'XYV-F-D30011', 'XYV-R-D30011',
    t0 + interval '14 hours', null, false, timezone('utc', now()) - interval '1 day'
  ),
  (
    'e0000001-0000-4000-8000-00000000000c', tid, 'XYV-D-30012', 'checked_in',
    t0 + interval '16 hours', t0 + interval '4 days' + interval '9 hours', 4, 1, '[]'::jsonb,
    'business', 'DLX', 'a0000001-0000-4000-8000-000000000012', 'corporate', 'shoulder', 70000.00, 280000.00,
    'card', 'corporate', 'website', 'XYV-F-D30012', 'XYV-R-D30012',
    t0 + interval '16 hours 15 minutes', null, true, timezone('utc', now()) - interval '1 day'
  ),
  (
    'e0000001-0000-4000-8000-00000000000d', tid, 'XYV-D-30013', 'checked_in',
    t0 - interval '2 days', t0 + interval '20 hours', 3, 2, '[]'::jsonb,
    'leisure', 'STD', 'a0000001-0000-4000-8000-000000000002', 'rack', 'peak', 54000.00, 162000.00,
    'card', 'transient', 'ota', 'XYV-F-D30013', 'XYV-R-D30013',
    t0 - interval '2 days' + interval '3 hours', null, true, timezone('utc', now()) - interval '5 days'
  );

  insert into hotel.reservation_guests (id, reservation_id, guest_id, is_primary, relationship) values
  (gen_random_uuid(), 'e0000001-0000-4000-8000-000000000001'::uuid, gid, true, null),
  (gen_random_uuid(), 'e0000001-0000-4000-8000-000000000002'::uuid, gid, true, null),
  (gen_random_uuid(), 'e0000001-0000-4000-8000-000000000003'::uuid, gid, true, null),
  (gen_random_uuid(), 'e0000001-0000-4000-8000-000000000004'::uuid, gid, true, null),
  (gen_random_uuid(), 'e0000001-0000-4000-8000-000000000005'::uuid, gid, true, null),
  (gen_random_uuid(), 'e0000001-0000-4000-8000-000000000006'::uuid, gid, true, null),
  (gen_random_uuid(), 'e0000001-0000-4000-8000-000000000007'::uuid, gid, true, null),
  (gen_random_uuid(), 'e0000001-0000-4000-8000-000000000008'::uuid, gid, true, null),
  (gen_random_uuid(), 'e0000001-0000-4000-8000-000000000009'::uuid, gid, true, null),
  (gen_random_uuid(), 'e0000001-0000-4000-8000-00000000000a'::uuid, gid, true, null),
  (gen_random_uuid(), 'e0000001-0000-4000-8000-00000000000b'::uuid, gid, true, null),
  (gen_random_uuid(), 'e0000001-0000-4000-8000-00000000000c'::uuid, gid, true, null),
  (gen_random_uuid(), 'e0000001-0000-4000-8000-00000000000d'::uuid, gid, true, null);

  -- --- Past 8 UTC months: checked-out stays (feeds occupancy trend; volume scaled for ~71 keys) ---
  for mo in 0..7 loop
    ms := date_trunc('month', timezone('utc', now()) - mo * interval '1 month');
    me := ms + interval '1 month';
    for k in 1..36 loop
      seq := seq + 1;
      rid := gen_random_uuid();
      arr := ms + (((k * 2 + mo) % 25) * interval '1 day') + interval '15 hours';
      dep := arr + ((3 + ((k + mo) % 4)) * interval '1 day');
      if dep > me - interval '1 hour' then
        dep := me - interval '1 hour';
      end if;
      if dep <= arr + interval '12 hours' then
        dep := arr + interval '2 days';
      end if;

      rmid := (
        array[
          'a0000001-0000-4000-8000-000000000001'::uuid,
          'a0000001-0000-4000-8000-000000000002'::uuid,
          'a0000001-0000-4000-8000-000000000005'::uuid,
          'a0000001-0000-4000-8000-00000000000b'::uuid,
          'a0000001-0000-4000-8000-00000000000c'::uuid,
          'a0000001-0000-4000-8000-00000000000d'::uuid,
          'a0000001-0000-4000-8000-00000000000e'::uuid,
          'a0000001-0000-4000-8000-000000000011'::uuid,
          'a0000001-0000-4000-8000-000000000013'::uuid,
          'a0000001-0000-4000-8000-000000000015'::uuid,
          'a0000001-0000-4000-8000-000000000019'::uuid,
          'a0000001-0000-4000-8000-00000000001c'::uuid,
          'a0000001-0000-4000-8000-000000000021'::uuid,
          'a0000001-0000-4000-8000-000000000025'::uuid,
          'a0000001-0000-4000-8000-00000000002b'::uuid,
          'a0000001-0000-4000-8000-000000000030'::uuid,
          'a0000001-0000-4000-8000-000000000037'::uuid,
          'a0000001-0000-4000-8000-00000000003d'::uuid
        ]
      )[1 + ((k + mo * 3) % 18)];

      nts := greatest(1, ceil(extract(epoch from (dep - arr)) / 86400.0)::int);
      rpn := (52000 + (k * 900) + mo * 450)::numeric;
      chg := rpn * nts;

      insert into hotel.reservations (
        id, tenant_id, confirmation_code, status, arrival_at, departure_at, nights, adults, children_json,
        purpose_of_visit, room_type_code, room_unit_id, rate_type, season_code, rate_per_night, total_room_charges,
        settlement_method, market_segment, source, folio_number, registration_number,
        checked_in_at, checked_out_at, digital_key_issued, created_at
      ) values (
        rid, tid, 'XYV-D-' || lpad(seq::text, 5, '0'), 'checked_out',
        arr, dep, nts,
        1 + (k % 3), case when k % 4 = 0 then '[{"age":4}]'::jsonb else '[]'::jsonb end,
        case when k % 2 = 0 then 'leisure' else 'business' end,
        'DLX', rmid,
        case when k % 3 = 0 then 'corporate' else 'rack' end,
        case when k % 2 = 0 then 'peak' else 'shoulder' end,
        rpn, chg,
        'card', 'transient', 'ota',
        'XYV-F-D' || lpad(seq::text, 5, '0'),
        'XYV-R-D' || lpad(seq::text, 5, '0'),
        arr + interval '1 hour',
        dep - interval '2 hours',
        (k % 2) = 0,
        ms - interval '20 days'
      );

      insert into hotel.reservation_guests (id, reservation_id, guest_id, is_primary, relationship)
      values (gen_random_uuid(), rid, gid, true, null);
    end loop;
  end loop;
end $$;

commit;
