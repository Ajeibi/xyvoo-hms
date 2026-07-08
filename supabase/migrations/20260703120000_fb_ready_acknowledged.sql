-- F&B acknowledged kitchen-ready orders leave the KDS once restaurant staff dismiss the alert.

alter table hotel.fb_orders
  add column if not exists ready_acknowledged_at timestamptz;

comment on column hotel.fb_orders.ready_acknowledged_at is
  'Set when F&B acknowledges a ready-for-service notification; ticket drops off kitchen live board.';
