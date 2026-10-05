-- Unit of purchase vs. unit of issue: items are always bought and issued in
-- the same unit today (inventory_items.unit_of_measure). Add an optional
-- purchase unit + conversion factor so a case-of-24 can be bought while the
-- stock ledger keeps counting pieces. unit_of_measure remains the issue unit
-- and every existing entry point (ledger, requisitions, waste, transfers,
-- stock counts) is untouched — this is additive and defaults to a 1:1 factor.

alter table hotel.inventory_items add column if not exists purchase_unit_id uuid references hotel.inventory_units(id);
alter table hotel.inventory_items add column if not exists purchase_to_issue_factor numeric(14,4) not null default 1;
