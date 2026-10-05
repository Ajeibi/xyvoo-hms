-- Accounts Phase 2, M5: payment runs + AP aging. A payment run pays one or more
-- already-approved vendor bills in one batch; each bill still gets its own
-- journal entry (Dr Accounts Payable, Cr the paying bank/cash account) so the
-- ledger stays traceable per bill, not just per batch. AP aging itself needs no
-- new table — it's a bucketed read over hotel.vendor_bills.

create table if not exists hotel.vendor_bill_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_date date not null default current_date,
  bank_account_id uuid not null references hotel.chart_of_accounts(id) on delete restrict,
  reference text,
  total numeric(14, 2) not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_vendor_bill_payments_tenant on hotel.vendor_bill_payments (tenant_id, payment_date desc);

comment on table hotel.vendor_bill_payments is 'A single payment batch (e.g. one bank transfer) covering one or more vendor bills. See vendor_bill_payment_lines for which bills it paid.';

create table if not exists hotel.vendor_bill_payment_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_id uuid not null references hotel.vendor_bill_payments(id) on delete cascade,
  vendor_bill_id uuid not null references hotel.vendor_bills(id) on delete restrict,
  amount numeric(14, 2) not null default 0,
  journal_entry_id uuid references hotel.journal_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (vendor_bill_id)
);

create index if not exists idx_vendor_bill_payment_lines_tenant_payment on hotel.vendor_bill_payment_lines (tenant_id, payment_id);

comment on table hotel.vendor_bill_payment_lines is 'One row per bill paid in a run. unique(vendor_bill_id): a bill is paid in full, once — no partial-payment support yet.';

do $$
declare
  t text;
begin
  foreach t in array array['vendor_bill_payments', 'vendor_bill_payment_lines']
  loop
    execute format('alter table hotel.%I enable row level security', t);
    execute format('alter table hotel.%I force row level security', t);

    execute format('drop policy if exists %I_service_role_all on hotel.%I', t, t);
    execute format(
      'create policy %I_service_role_all on hotel.%I for all to public using (true) with check (true)',
      t, t
    );
    execute format('drop policy if exists %I_select_member on hotel.%I', t, t);
    execute format(
      'create policy %I_select_member on hotel.%I for select to authenticated
       using (exists (select 1 from hotel.memberships m where m.tenant_id = %I.tenant_id and m.user_id = auth.uid()))',
      t, t, t
    );
    execute format('drop policy if exists %I_insert_member on hotel.%I', t, t);
    execute format(
      'create policy %I_insert_member on hotel.%I for insert to authenticated
       with check (exists (select 1 from hotel.memberships m where m.tenant_id = %I.tenant_id and m.user_id = auth.uid()))',
      t, t, t
    );
  end loop;
end $$;
