-- Track how F&B settled an order when it closes (kitchen history reads this; no amounts).

alter table hotel.fb_orders
  add column if not exists settlement_method text
    check (settlement_method in ('cash', 'card', 'pos', 'room_charge'));

comment on column hotel.fb_orders.settlement_method is
  'How F&B closed the ticket: cash/card/pos = paid at outlet; room_charge = posted to guest folio.';
