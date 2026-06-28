-- Sample folio lines for Firefly in-house stays (run after frontdesk_ops + folio_phase10 migrations)
-- Tenant: 41604dc6-9ce1-49bd-a0bb-5aa777ec7463

insert into hotel.folio_transactions (
  tenant_id, reservation_id, kind, amount, method, status, description, department, split_leg
)
select
  r.tenant_id,
  r.id,
  'charge',
  r.total_room_charges,
  'system',
  'posted',
  'Room charges (seed)',
  'rooms',
  case when r.settlement_method = 'direct_bill' then 'company' else 'guest' end
from hotel.reservations r
where r.tenant_id = '41604dc6-9ce1-49bd-a0bb-5aa777ec7463'
  and r.status = 'checked_in'
  and not exists (
    select 1 from hotel.folio_transactions ft
    where ft.reservation_id = r.id and ft.kind = 'charge' and ft.method = 'system'
  );

insert into hotel.folio_transactions (
  tenant_id, reservation_id, kind, amount, method, status, description, reference
)
select
  r.tenant_id,
  r.id,
  'payment',
  -least(r.total_room_charges * 0.5, r.total_room_charges),
  'card',
  'posted',
  'Partial payment (seed)',
  'SEED-PAY-1'
from hotel.reservations r
where r.tenant_id = '41604dc6-9ce1-49bd-a0bb-5aa777ec7463'
  and r.status = 'checked_in'
  and r.confirmation_code = 'XYV-10001'
  and not exists (
    select 1 from hotel.folio_transactions ft where ft.reservation_id = r.id and ft.kind = 'payment'
  );
