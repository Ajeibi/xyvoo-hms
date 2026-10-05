-- Delivery charges at checkout. The shopper picks one of the store's active
-- delivery options (store.delivery_zones); checkout adds its fee to the order
-- total after store.create_guest_order has priced the items, and keeps the
-- option's name on the order for the merchant's records.

alter table store.orders
  add column if not exists delivery_fee numeric(12,2) not null default 0 check (delivery_fee >= 0),
  add column if not exists delivery_method text;
