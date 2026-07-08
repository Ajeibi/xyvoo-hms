-- Rich operational seed: guests, reservations (past + present + future), folio/rate fields, links.
-- SUPERSEDED: use `npm run seed:demo -- <slug>` for guests, reservations, folio, and F&B demo data.
-- Dates are anchored to UTC "today" so dashboard (arrivals/departures/revenue/occupancy trend) stays meaningful.
--
-- Prerequisites:
--   1. Migrations applied (hotel.guests / reservations / room_units / reservation_guests).
--   2. Firefly tenant + 71 room keys from seed.firefly.sql (tenant_id + a0000001-* room UUIDs).
--
-- Optional: run seed.dashboard_timeline.sql first for extra XYV-D-* overlay; this file does not remove those.
--
-- Idempotent footprint:
--   • Removes only guests with id from b0000002-0000-4000-8000-000000000001 through …00002d
--   • Removes reservations with confirmation_code like 'XYV-FULL-%'
--
-- Run (service role / postgres):
--   psql $DATABASE_URL -f supabase/seed.firefly.sql
--   psql $DATABASE_URL -f supabase/seed.hotel_full_operational.sql

begin;

-- ---------------------------------------------------------------------------
-- 1) Tear down prior XYV-FULL-* seed only
-- ---------------------------------------------------------------------------
delete from hotel.reservation_guests
where reservation_id in (
  select id from hotel.reservations
  where tenant_id = '41604dc6-9ce1-49bd-a0bb-5aa777ec7463'
    and confirmation_code like 'XYV-FULL-%'
);

delete from hotel.reservations
where tenant_id = '41604dc6-9ce1-49bd-a0bb-5aa777ec7463'
  and confirmation_code like 'XYV-FULL-%';

delete from hotel.guests
where tenant_id = '41604dc6-9ce1-49bd-a0bb-5aa777ec7463'
  and id >= 'b0000002-0000-4000-8000-000000000001'::uuid
  and id <= 'b0000002-0000-4000-8000-00000000002d'::uuid;

-- ---------------------------------------------------------------------------
-- 2) 45 guest profiles (international mix; demo PII — not real people)
-- ---------------------------------------------------------------------------
insert into hotel.guests (id, tenant_id, title, first_name, last_name, nationality, id_type, id_number, id_expiry_date, date_of_birth, gender, phone, email, whatsapp, preferred_channel, created_at) values
('b0000002-0000-4000-8000-000000000001', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Ms', 'Adaeze', 'Okoro', 'NG', 'national_id', 'NG-FULL-000001', '2031-06-01', '1990-03-15', 'female', '+2349010000001', 'adaeze.okoro.full@example.com', null, 'whatsapp', now() - interval '400 days'),
('b0000002-0000-4000-8000-000000000002', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Bruno', 'Silva', 'BR', 'passport', 'BR998877001', '2030-01-20', '1987-11-02', 'male', '+5511988000002', 'bruno.silva.full@example.com', null, 'email', now() - interval '395 days'),
('b0000002-0000-4000-8000-000000000003', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mrs', 'Catherine', 'Mensah', 'GH', 'passport', 'GH445500003', '2029-09-09', '1984-07-22', 'female', '+2332411000003', 'c.mensah.full@example.com', '+2332411000003', 'phone', now() - interval '390 days'),
('b0000002-0000-4000-8000-000000000004', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Dr', 'Daniel', 'Park', 'KR', 'passport', 'KR556677004', '2032-04-04', '1979-12-01', 'male', '+821012340004', 'daniel.park.full@example.com', null, 'email', now() - interval '385 days'),
('b0000002-0000-4000-8000-000000000005', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Ms', 'Esperanza', 'Lopez', 'ES', 'passport', 'ES334455005', '2028-08-18', '1993-05-30', 'female', '+346001100005', 'esperanza.lopez.full@example.com', null, 'whatsapp', now() - interval '380 days'),
('b0000002-0000-4000-8000-000000000006', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Faisal', 'Rahman', 'BD', 'passport', 'BD221100006', '2030-02-14', '1991-09-09', 'male', '+8801711000006', 'faisal.rahman.full@example.com', null, 'email', now() - interval '375 days'),
('b0000002-0000-4000-8000-000000000007', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mrs', 'Gifty', 'Owusu', 'GH', 'national_id', 'GH-NIA-00007', '2029-11-11', '1988-04-04', 'female', '+2335012000007', 'gifty.owusu.full@example.com', null, 'sms', now() - interval '370 days'),
('b0000002-0000-4000-8000-000000000008', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Henrik', 'Larsson', 'SE', 'passport', 'SE887766008', '2031-03-03', '1982-01-19', 'male', '+467012340008', 'henrik.larsson.full@example.com', null, 'email', now() - interval '365 days'),
('b0000002-0000-4000-8000-000000000009', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Ms', 'Ines', 'Boudiaf', 'DZ', 'passport', 'DZ665544009', '2028-12-24', '1996-08-08', 'female', '+213550000009', 'ines.boudiaf.full@example.com', null, 'phone', now() - interval '360 days'),
('b0000002-0000-4000-8000-00000000000a', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Jonas', 'Meier', 'DE', 'passport', 'DE443322010', '2030-07-07', '1985-06-06', 'male', '+491701100010', 'jonas.meier.full@example.com', null, 'email', now() - interval '355 days'),
('b0000002-0000-4000-8000-00000000000b', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mrs', 'Keisha', 'Thompson', 'JM', 'passport', 'JM221199011', '2029-05-05', '1992-02-28', 'female', '+1876555011', 'keisha.thompson.full@example.com', null, 'whatsapp', now() - interval '350 days'),
('b0000002-0000-4000-8000-00000000000c', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Luis', 'Ortega', 'MX', 'passport', 'MX998811012', '2031-10-10', '1989-10-10', 'male', '+525512340012', 'luis.ortega.full@example.com', null, 'email', now() - interval '345 days'),
('b0000002-0000-4000-8000-00000000000d', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Ms', 'Miriam', 'Katz', 'IL', 'passport', 'IL776655013', '2028-04-04', '1994-12-12', 'female', '+972501100013', 'miriam.katz.full@example.com', null, 'email', now() - interval '340 days'),
('b0000002-0000-4000-8000-00000000000e', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Nabil', 'Farouk', 'MA', 'passport', 'MA554433014', '2030-08-08', '1983-03-03', 'male', '+212612000014', 'nabil.farouk.full@example.com', null, 'phone', now() - interval '335 days'),
('b0000002-0000-4000-8000-00000000000f', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Dr', 'Olivia', 'Nguyen', 'VN', 'passport', 'VN332211015', '2032-01-01', '1991-07-17', 'female', '+849012300015', 'olivia.nguyen.full@example.com', null, 'email', now() - interval '330 days'),
('b0000002-0000-4000-8000-000000000010', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Pierre', 'Dubois', 'FR', 'passport', 'FR110099016', '2029-06-06', '1978-05-25', 'male', '+336010100016', 'pierre.dubois.full@example.com', null, 'email', now() - interval '325 days'),
('b0000002-0000-4000-8000-000000000011', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Ms', 'Qi', 'Ling', 'CN', 'passport', 'CN887700017', '2031-11-11', '1995-01-01', 'female', '+861380010017', 'qi.ling.full@example.com', null, 'whatsapp', now() - interval '320 days'),
('b0000002-0000-4000-8000-000000000012', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mrs', 'Rose', 'Osei', 'GH', 'national_id', 'GH-NIA-00018', '2030-03-03', '1986-09-09', 'female', '+233242200018', 'rose.osei.full@example.com', null, 'phone', now() - interval '315 days'),
('b0000002-0000-4000-8000-000000000013', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Stefan', 'Novak', 'RS', 'passport', 'RS665500019', '2028-10-10', '1990-04-14', 'male', '+381641100019', 'stefan.novak.full@example.com', null, 'email', now() - interval '310 days'),
('b0000002-0000-4000-8000-000000000014', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Ms', 'Tara', 'Williams', 'CA', 'passport', 'CA443300020', '2032-02-02', '1997-06-21', 'female', '+1416555020', 'tara.williams.full@example.com', null, 'email', now() - interval '305 days'),
('b0000002-0000-4000-8000-000000000015', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Uche', 'Nnamdi', 'NG', 'national_id', 'NG-FULL-000021', '2031-01-15', '1988-08-08', 'male', '+2349022000021', 'uche.nnamdi.full@example.com', null, 'whatsapp', now() - interval '300 days'),
('b0000002-0000-4000-8000-000000000016', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mrs', 'Vera', 'Kowalski', 'PL', 'passport', 'PL221100022', '2029-07-07', '1984-11-11', 'female', '+485012340022', 'vera.kowalski.full@example.com', null, 'email', now() - interval '295 days'),
('b0000002-0000-4000-8000-000000000017', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'William', 'Scott', 'AU', 'passport', 'AU998877023', '2030-12-12', '1993-03-03', 'male', '+614001100023', 'william.scott.full@example.com', null, 'email', now() - interval '290 days'),
('b0000002-0000-4000-8000-000000000018', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Ms', 'Ximena', 'Rojas', 'CO', 'passport', 'CO556644024', '2028-09-19', '1992-12-01', 'female', '+573001100024', 'ximena.rojas.full@example.com', null, 'whatsapp', now() - interval '285 days'),
('b0000002-0000-4000-8000-000000000019', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Yann', 'Favre', 'CH', 'passport', 'CH334422025', '2031-05-05', '1981-04-04', 'male', '+417912340025', 'yann.favre.full@example.com', null, 'email', now() - interval '280 days'),
('b0000002-0000-4000-8000-00000000001a', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Dr', 'Zainab', 'Ali', 'SA', 'passport', 'SA112233026', '2030-06-06', '1990-10-10', 'female', '+966501100026', 'zainab.ali.full@example.com', null, 'phone', now() - interval '275 days'),
('b0000002-0000-4000-8000-00000000001b', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Aaron', 'Brooks', 'US', 'passport', 'US998811027', '2032-08-08', '1987-07-07', 'male', '+1312555027', 'aaron.brooks.full@example.com', null, 'email', now() - interval '270 days'),
('b0000002-0000-4000-8000-00000000001c', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Ms', 'Bianca', 'Romano', 'IT', 'passport', 'IT776655028', '2029-04-04', '1996-05-15', 'female', '+393339990028', 'bianca.romano.full@example.com', null, 'email', now() - interval '265 days'),
('b0000002-0000-4000-8000-00000000001d', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Caleb', 'Morgan', 'GB', 'passport', 'GB554433029', '2031-09-09', '1994-01-29', 'male', '+447700900029', 'caleb.morgan.full@example.com', null, 'whatsapp', now() - interval '260 days'),
('b0000002-0000-4000-8000-00000000001e', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mrs', 'Dina', 'Haddad', 'LB', 'passport', 'LB332211030', '2028-11-11', '1989-02-02', 'female', '+96130000030', 'dina.haddad.full@example.com', null, 'email', now() - interval '255 days'),
('b0000002-0000-4000-8000-00000000001f', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Ethan', 'Coetzee', 'ZA', 'passport', 'ZA110099031', '2030-04-04', '1991-11-11', 'male', '+27821234031', 'ethan.coetzee.full@example.com', null, 'phone', now() - interval '250 days'),
('b0000002-0000-4000-8000-000000000020', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Ms', 'Fiona', 'Murray', 'IE', 'passport', 'IE887766032', '2032-03-03', '1993-08-18', 'female', '+353851234032', 'fiona.murray.full@example.com', null, 'email', now() - interval '245 days'),
('b0000002-0000-4000-8000-000000000021', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'George', 'Papadopoulos', 'GR', 'passport', 'GR665544033', '2029-02-02', '1980-06-06', 'male', '+306971234033', 'g.papadopoulos.full@example.com', null, 'email', now() - interval '240 days'),
('b0000002-0000-4000-8000-000000000022', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mrs', 'Hana', 'Yamamoto', 'JP', 'passport', 'JP443322034', '2031-07-07', '1986-03-03', 'female', '+819012300034', 'hana.yamamoto.full@example.com', null, 'email', now() - interval '235 days'),
('b0000002-0000-4000-8000-000000000023', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Ibrahim', 'Suleiman', 'NG', 'national_id', 'NG-FULL-000035', '2030-12-01', '1992-09-19', 'male', '+2349033000035', 'ibrahim.suleiman.full@example.com', null, 'sms', now() - interval '230 days'),
('b0000002-0000-4000-8000-000000000024', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Ms', 'Julia', 'Costa', 'PT', 'passport', 'PT221199036', '2028-06-06', '1995-04-04', 'female', '+351910123036', 'julia.costa.full@example.com', null, 'whatsapp', now() - interval '225 days'),
('b0000002-0000-4000-8000-000000000025', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Karl', 'Weber', 'AT', 'passport', 'AT998877037', '2030-10-10', '1977-12-12', 'male', '+436601234037', 'karl.weber.full@example.com', null, 'email', now() - interval '220 days'),
('b0000002-0000-4000-8000-000000000026', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Dr', 'Laura', 'Schmidt', 'AT', 'passport', 'AT776655038', '2031-02-02', '1983-05-20', 'female', '+436602340038', 'laura.schmidt.full@example.com', null, 'email', now() - interval '215 days'),
('b0000002-0000-4000-8000-000000000027', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Mohamed', 'El-Sayed', 'EG', 'passport', 'EG554433039', '2029-08-08', '1990-01-11', 'male', '+20100000039', 'm.elsayed.full@example.com', null, 'phone', now() - interval '210 days'),
('b0000002-0000-4000-8000-000000000028', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Ms', 'Nadia', 'Petrova', 'RU', 'passport', 'RU332211040', '2028-03-03', '1994-07-07', 'female', '+791612340040', 'nadia.petrova.full@example.com', null, 'email', now() - interval '205 days'),
('b0000002-0000-4000-8000-000000000029', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Oscar', 'Nilsson', 'NO', 'passport', 'NO110099041', '2032-05-05', '1988-02-14', 'male', '+47901234041', 'oscar.nilsson.full@example.com', null, 'email', now() - interval '200 days'),
('b0000002-0000-4000-8000-00000000002a', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mrs', 'Priya', 'Sharma', 'IN', 'passport', 'IN887766042', '2030-11-11', '1991-09-30', 'female', '+919811234042', 'priya.sharma.full@example.com', null, 'whatsapp', now() - interval '195 days'),
('b0000002-0000-4000-8000-00000000002b', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Quentin', 'Laurent', 'BE', 'passport', 'BE665544043', '2029-01-01', '1985-05-05', 'male', '+324701234043', 'quentin.laurent.full@example.com', null, 'email', now() - interval '190 days'),
('b0000002-0000-4000-8000-00000000002c', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Ms', 'Rita', 'Santos', 'PT', 'passport', 'PT443322044', '2031-08-08', '1997-01-01', 'female', '+351920123044', 'rita.santos.full@example.com', null, 'email', now() - interval '185 days'),
('b0000002-0000-4000-8000-00000000002d', '41604dc6-9ce1-49bd-a0bb-5aa777ec7463', 'Mr', 'Samir', 'Hussein', 'AE', 'passport', 'AE221100045', '2030-05-20', '1984-10-10', 'male', '+971501234045', 'samir.hussein.full@example.com', null, 'email', now() - interval '180 days');

-- ---------------------------------------------------------------------------
-- 3) Reservations + links (dynamic dates). Financial columns: rate_per_night, total_room_charges,
--    settlement_method, market_segment, commission_value where applicable.
-- ---------------------------------------------------------------------------
do $$
declare
  tid uuid := '41604dc6-9ce1-49bd-a0bb-5aa777ec7463';
  t0 timestamptz := (timezone('utc', now())::date::timestamp at time zone 'UTC');
  seq int := 50000;
  rid uuid;
  mo int;
  k int;
  ms timestamptz;
  me timestamptz;
  arr timestamptz;
  dep timestamptz;
  rmid uuid;
  nts int;
  rpn numeric(12, 2);
  chg numeric(14, 2);
  gst uuid;
  room_pool uuid[] := array[
    'a0000001-0000-4000-8000-000000000001'::uuid,
    'a0000001-0000-4000-8000-000000000002'::uuid,
    'a0000001-0000-4000-8000-000000000003'::uuid,
    'a0000001-0000-4000-8000-000000000005'::uuid,
    'a0000001-0000-4000-8000-00000000000b'::uuid,
    'a0000001-0000-4000-8000-00000000000c'::uuid,
    'a0000001-0000-4000-8000-00000000000d'::uuid,
    'a0000001-0000-4000-8000-00000000000f'::uuid,
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
  ];
  guest_pool uuid[] := array(
    select id from hotel.guests
    where tenant_id = tid
      and id between 'b0000002-0000-4000-8000-000000000001'::uuid and 'b0000002-0000-4000-8000-00000000002d'::uuid
    order by id
  );
  gix int;
begin
  -- --- Past 10 UTC months: checked-out stays (occupancy trend + historical room revenue) ---
  for mo in 0..9 loop
    ms := date_trunc('month', timezone('utc', now()) - mo * interval '1 month');
    me := ms + interval '1 month';
    for k in 1..42 loop
      seq := seq + 1;
      rid := gen_random_uuid();
      arr := ms + (((k * 2 + mo * 3) % 26) * interval '1 day') + interval '14 hours' + (k % 5) * interval '30 minutes';
      dep := arr + ((2 + ((k + mo) % 5)) * interval '1 day') + interval '10 hours';
      if dep > me - interval '2 hours' then
        dep := me - interval '2 hours';
      end if;
      if dep <= arr + interval '18 hours' then
        dep := arr + interval '2 days' + interval '9 hours';
      end if;

      rmid := room_pool[1 + ((k + mo * 2) % array_length(room_pool, 1))];
      nts := greatest(1, ceil(extract(epoch from (dep - arr)) / 86400.0)::int);
      rpn := (48500 + (k * 850) + mo * 400 + (mo % 3) * 1200)::numeric(12, 2);
      chg := round((rpn * nts)::numeric, 2);

      insert into hotel.reservations (
        id, tenant_id, confirmation_code, status, arrival_at, departure_at, nights, adults, children_json,
        purpose_of_visit, room_type_code, room_unit_id, room_preferences_text,
        rate_type, season_code, rate_per_night, total_room_charges, rate_overridden, show_rate_on_registration_card,
        vat_applicable, tax_exempt, settlement_method, preauth_amount, market_segment, source,
        travel_agent_name, commission_plan, commission_value, guest_remarks, folio_number, registration_number,
        checked_in_at, checked_out_at, digital_key_issued, created_at
      ) values (
        rid, tid, 'XYV-FULL-' || lpad(seq::text, 5, '0'), 'checked_out',
        arr, dep, nts,
        1 + (k % 3),
        case when k % 5 = 0 then '[{"age":6},{"age":9}]'::jsonb when k % 5 = 1 then '[{"age":3}]'::jsonb else '[]'::jsonb end,
        case when k % 2 = 0 then 'leisure' else 'business' end,
        case when k % 4 = 0 then 'STE' when k % 4 = 1 then 'JST' when k % 4 = 2 then 'DLX' else 'STD' end,
        rmid,
        case when k % 6 = 0 then 'High floor' when k % 6 = 1 then 'Near elevator' else null end,
        case when k % 3 = 0 then 'corporate' when k % 3 = 1 then 'promotional' else 'rack' end,
        case when mo % 2 = 0 then 'peak' else 'shoulder' end,
        rpn, chg, false, true, true, false,
        case when k % 4 = 0 then 'direct_bill' when k % 4 = 1 then 'split' else 'card' end,
        case when k % 4 = 0 then 500000::numeric else null end,
        case when k % 5 = 0 then 'corporate' when k % 5 = 1 then 'government' else 'transient' end,
        case when k % 7 = 0 then 'ota' when k % 7 = 1 then 'website' when k % 7 = 2 then 'walk_in' else 'phone' end,
        case when k % 8 = 0 then 'Lagos Travel Hub' else null end,
        case when k % 8 = 0 then 'ta_10pct' else null end,
        case when k % 8 = 0 then round(chg * 0.10, 2) else null end,
        case when k % 9 = 0 then 'Corporate guest — late arrival' else null end,
        'XYV-FF-' || lpad(seq::text, 5, '0'),
        'XYV-FR-' || lpad(seq::text, 5, '0'),
        arr + interval '45 minutes',
        dep - interval '90 minutes',
        (k % 3) <> 0,
        ms - interval '25 days'
      );

      gix := 1 + ((seq + k + mo) % array_length(guest_pool, 1));
      gst := guest_pool[gix];
      insert into hotel.reservation_guests (id, reservation_id, guest_id, is_primary, relationship)
      values (gen_random_uuid(), rid, gst, true, null);
    end loop;
  end loop;

  -- --- In-house (checked_in) spanning today / tonight / next days (feeds revenue today + room status) ---
  insert into hotel.reservations (
    id, tenant_id, confirmation_code, status, arrival_at, departure_at, nights, adults, children_json,
    purpose_of_visit, room_type_code, room_unit_id, rate_type, season_code, rate_per_night, total_room_charges,
    settlement_method, market_segment, source, folio_number, registration_number,
    checked_in_at, checked_out_at, digital_key_issued, created_at
  ) values
  (gen_random_uuid(), tid, 'XYV-FULL-60001', 'checked_in',
    t0 - interval '1 day' + interval '15 hours', t0 + interval '2 days' + interval '10 hours', 4, 2, '[{"age":7}]'::jsonb,
    'leisure', 'DLX', 'a0000001-0000-4000-8000-000000000001'::uuid, 'rack', 'peak', 68500.00, 274000.00,
    'card', 'transient', 'ota', 'XYV-FF-60001', 'XYV-FR-60001',
    t0 - interval '1 day' + interval '16 hours', null, true, now() - interval '10 days'),
  (gen_random_uuid(), tid, 'XYV-FULL-60002', 'checked_in',
    t0 + interval '8 hours', t0 + interval '5 days' + interval '11 hours', 5, 1, '[]'::jsonb,
    'business', 'STD', 'a0000001-0000-4000-8000-000000000005'::uuid, 'corporate', 'peak', 54000.00, 270000.00,
    'direct_bill', 'corporate', 'website', 'XYV-FF-60002', 'XYV-FR-60002',
    t0 + interval '8 hours 30 minutes', null, true, now() - interval '4 days'),
  (gen_random_uuid(), tid, 'XYV-FULL-60003', 'checked_in',
    t0 - interval '2 days' + interval '12 hours', t0 + interval '1 day' + interval '9 hours', 4, 2, '[]'::jsonb,
    'business', 'DLX', 'a0000001-0000-4000-8000-00000000000b'::uuid, 'corporate', 'shoulder', 72000.00, 288000.00,
    'card', 'corporate', 'phone', 'XYV-FF-60003', 'XYV-FR-60003',
    t0 - interval '2 days' + interval '13 hours', null, true, now() - interval '12 days'),
  (gen_random_uuid(), tid, 'XYV-FULL-60004', 'checked_in',
    t0 + interval '10 hours', t0 + interval '3 days' + interval '10 hours', 3, 2, '[{"age":4}]'::jsonb,
    'leisure', 'STE', 'a0000001-0000-4000-8000-000000000013'::uuid, 'promotional', 'peak', 112000.00, 336000.00,
    'split', 'transient', 'website', 'XYV-FF-60004', 'XYV-FR-60004',
    t0 + interval '10 hours 15 minutes', null, true, now() - interval '3 days'),
  (gen_random_uuid(), tid, 'XYV-FULL-60005', 'checked_in',
    t0 - interval '3 days' + interval '14 hours', t0 + interval '4 days' + interval '11 hours', 8, 1, '[]'::jsonb,
    'business', 'DLX', 'a0000001-0000-4000-8000-00000000000f'::uuid, 'rack', 'peak', 69500.00, 556000.00,
    'direct_bill', 'government', 'phone', 'XYV-FF-60005', 'XYV-FR-60005',
    t0 - interval '3 days' + interval '15 hours', null, true, now() - interval '20 days'),
  (gen_random_uuid(), tid, 'XYV-FULL-60006', 'checked_in',
    t0 + interval '11 hours', t0 + interval '2 days' + interval '10 hours', 2, 1, '[]'::jsonb,
    'transit', 'STD', 'a0000001-0000-4000-8000-000000000011'::uuid, 'walk_in_bar', 'shoulder', 51000.00, 102000.00,
    'cash', 'transient', 'walk_in', 'XYV-FF-60006', 'XYV-FR-60006',
    t0 + interval '11 hours 20 minutes', null, false, now() - interval '1 day');

  insert into hotel.reservation_guests (id, reservation_id, guest_id, is_primary, relationship)
  select gen_random_uuid(), r.id, 'b0000002-0000-4000-8000-000000000001'::uuid, true, null
  from hotel.reservations r where r.tenant_id = tid and r.confirmation_code = 'XYV-FULL-60001';
  insert into hotel.reservation_guests (id, reservation_id, guest_id, is_primary, relationship)
  select gen_random_uuid(), r.id, 'b0000002-0000-4000-8000-000000000002'::uuid, true, null
  from hotel.reservations r where r.tenant_id = tid and r.confirmation_code = 'XYV-FULL-60002';
  insert into hotel.reservation_guests (id, reservation_id, guest_id, is_primary, relationship)
  select gen_random_uuid(), r.id, 'b0000002-0000-4000-8000-000000000003'::uuid, true, null
  from hotel.reservations r where r.tenant_id = tid and r.confirmation_code = 'XYV-FULL-60003';
  insert into hotel.reservation_guests (id, reservation_id, guest_id, is_primary, relationship)
  select gen_random_uuid(), r.id, 'b0000002-0000-4000-8000-000000000004'::uuid, true, null
  from hotel.reservations r where r.tenant_id = tid and r.confirmation_code = 'XYV-FULL-60004';
  insert into hotel.reservation_guests (id, reservation_id, guest_id, is_primary, relationship)
  select gen_random_uuid(), r.id, 'b0000002-0000-4000-8000-000000000005'::uuid, true, null
  from hotel.reservations r where r.tenant_id = tid and r.confirmation_code = 'XYV-FULL-60005';
  insert into hotel.reservation_guests (id, reservation_id, guest_id, is_primary, relationship)
  select gen_random_uuid(), r.id, 'b0000002-0000-4000-8000-000000000006'::uuid, true, null
  from hotel.reservations r where r.tenant_id = tid and r.confirmation_code = 'XYV-FULL-60006';

  -- --- Future confirmed (next 90 days) ---
  for k in 1..22 loop
    seq := seq + 1;
    rid := gen_random_uuid();
    arr := t0 + ((k * 3) * interval '1 day') + interval '14 hours';
    dep := arr + ((2 + (k % 4)) * interval '1 day') + interval '10 hours';
    nts := greatest(1, ceil(extract(epoch from (dep - arr)) / 86400.0)::int);
    rpn := (52000 + k * 1100)::numeric(12, 2);
    chg := round((rpn * nts)::numeric, 2);

    insert into hotel.reservations (
      id, tenant_id, confirmation_code, status, arrival_at, departure_at, nights, adults, children_json,
      purpose_of_visit, room_type_code, room_unit_id, rate_type, season_code, rate_per_night, total_room_charges,
      settlement_method, market_segment, source, folio_number, registration_number,
      checked_in_at, checked_out_at, digital_key_issued, created_at
    ) values (
      rid, tid, 'XYV-FULL-' || lpad(seq::text, 5, '0'), 'confirmed',
      arr, dep, nts, 1 + (k % 2), case when k % 3 = 0 then '[{"age":8}]'::jsonb else '[]'::jsonb end,
      case when k % 2 = 0 then 'leisure' else 'business' end,
      case when k % 3 = 0 then 'STE' when k % 3 = 1 then 'DLX' else 'STD' end,
      null,
      case when k % 3 = 0 then 'corporate' else 'rack' end,
      'peak', rpn, chg,
      'card', case when k % 5 = 0 then 'group' else 'transient' end, case when k % 4 = 0 then 'ota' else 'website' end,
      'XYV-FF-' || lpad(seq::text, 5, '0'), 'XYV-FR-' || lpad(seq::text, 5, '0'),
      null, null, false, now() - interval '2 days'
    );

    gix := 1 + (k % array_length(guest_pool, 1));
    insert into hotel.reservation_guests (id, reservation_id, guest_id, is_primary, relationship)
    values (gen_random_uuid(), rid, guest_pool[gix], true, null);
  end loop;

  -- --- No-shows (within last 7 days UTC) ---
  for k in 1..4 loop
    seq := seq + 1;
    rid := gen_random_uuid();
    arr := t0 - ((k + 1) * interval '1 day') + interval '18 hours';
    dep := arr + interval '1 day' + interval '10 hours';
    insert into hotel.reservations (
      id, tenant_id, confirmation_code, status, arrival_at, departure_at, nights, adults, children_json,
      purpose_of_visit, room_type_code, room_unit_id, rate_type, season_code, rate_per_night, total_room_charges,
      settlement_method, market_segment, source, folio_number, registration_number,
      checked_in_at, checked_out_at, digital_key_issued, created_at
    ) values (
      rid, tid, 'XYV-FULL-' || lpad(seq::text, 5, '0'), 'no_show',
      arr, dep, 1, 1, '[]'::jsonb, 'leisure', 'STD', null, 'rack', 'shoulder', 49800.00, 49800.00,
      'card', 'transient', 'ota', 'XYV-FF-' || lpad(seq::text, 5, '0'), 'XYV-FR-' || lpad(seq::text, 5, '0'),
      null, null, false, now() - interval '14 days'
    );
    insert into hotel.reservation_guests (id, reservation_id, guest_id, is_primary, relationship)
    values (gen_random_uuid(), rid, guest_pool[7 + k], true, null);
  end loop;

  -- --- Cancellations (arrival within last 30 days) ---
  for k in 1..5 loop
    seq := seq + 1;
    rid := gen_random_uuid();
    arr := t0 - ((k * 4 + 3) * interval '1 day') + interval '12 hours';
    dep := arr + interval '3 days' + interval '10 hours';
    nts := 3;
    rpn := (56000 + k * 700)::numeric(12, 2);
    chg := round((rpn * nts)::numeric, 2);
    insert into hotel.reservations (
      id, tenant_id, confirmation_code, status, arrival_at, departure_at, nights, adults, children_json,
      purpose_of_visit, room_type_code, room_unit_id, rate_type, season_code, rate_per_night, total_room_charges,
      settlement_method, market_segment, source, folio_number, registration_number,
      checked_in_at, checked_out_at, digital_key_issued, created_at
    ) values (
      rid, tid, 'XYV-FULL-' || lpad(seq::text, 5, '0'), 'cancelled',
      arr, dep, nts, 2, '[]'::jsonb, 'leisure', 'DLX', null, 'promotional', 'shoulder', rpn, chg,
      'card', 'transient', 'ota', 'XYV-FF-' || lpad(seq::text, 5, '0'), 'XYV-FR-' || lpad(seq::text, 5, '0'),
      null, null, false, now() - interval '35 days'
    );
    insert into hotel.reservation_guests (id, reservation_id, guest_id, is_primary, relationship)
    values (gen_random_uuid(), rid, guest_pool[10 + k], true, null);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4) Align physical key status with all active in-house stays (any confirmation_code)
-- ---------------------------------------------------------------------------
update hotel.room_units u
set status = 'vacant_clean', notes = null
where tenant_id = '41604dc6-9ce1-49bd-a0bb-5aa777ec7463';

update hotel.room_units u
set status = 'occupied'
where tenant_id = '41604dc6-9ce1-49bd-a0bb-5aa777ec7463'
  and id in (
    select distinct r.room_unit_id
    from hotel.reservations r
    where r.tenant_id = u.tenant_id
      and r.status = 'checked_in'
      and r.room_unit_id is not null
      and r.departure_at > timezone('utc', now())
  );

-- A few keys in turnover for housekeeping realism
update hotel.room_units set status = 'dirty', notes = 'Post-checkout inspection'
where id = 'a0000001-0000-4000-8000-000000000003'::uuid;
update hotel.room_units set status = 'inspected', notes = null
where id = 'a0000001-0000-4000-8000-000000000004'::uuid;

commit;
