-- Timestamps for the F&B service window (kitchen ready -> F&B served/completed).
-- kitchen_ready_at: set when the kitchen finishes a ticket (order becomes "ready").
-- served_at: set when F&B first marks the order served (or when it is completed/closed).
alter table hotel.fb_orders
  add column if not exists kitchen_ready_at timestamptz,
  add column if not exists served_at timestamptz;

comment on column hotel.fb_orders.kitchen_ready_at is
  'When the kitchen marked the whole ticket ready. Start of the F&B service window.';
comment on column hotel.fb_orders.served_at is
  'When F&B first marked the order served (or completed). End of the F&B service window.';
