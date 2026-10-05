-- Make item types behaviorally real, not just cosmetic labels:
-- Fixed assets must never enter the stock ledger (they belong on a separate
-- asset register), and Operating Equipment should read as breakage/loss
-- rather than the spoilage language used for consumables.

alter table hotel.inventory_item_types add column if not exists is_fixed_asset boolean not null default false;
alter table hotel.inventory_item_types add column if not exists is_equipment boolean not null default false;

-- Fix existing tenant data: 'asset' was being used ambiguously for both
-- fixed assets (ovens, fridges — not inventory) and durable operating
-- equipment (cutlery, crockery — inventory, but breakage-tracked). Split it:
-- 'asset' becomes strictly "fixed asset, excluded from the ledger", and a new
-- 'operating_equipment' type is seeded for the durable-goods case.
update hotel.inventory_item_types set is_fixed_asset = true where code = 'asset';
update hotel.inventory_item_types set is_equipment = true where code = 'linen';

insert into hotel.inventory_item_types (tenant_id, name, code, sort_order, is_equipment)
select t.id, 'Operating Equipment', 'operating_equipment', 8, true
from public.tenants t
where t.product = 'hotel'
on conflict (tenant_id, code) do nothing;
