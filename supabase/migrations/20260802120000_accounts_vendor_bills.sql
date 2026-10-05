-- Accounts Phase 2, M4: vendor bills + approval workflow. Reuses Procurement's
-- existing hotel.procurement_approval_thresholds (department + amount -> approver
-- tier) rather than a second threshold table — the application layer
-- (vendor-bills.ts) calls the same resolver Procurement's purchase orders use.

create table if not exists hotel.vendor_bills (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  vendor_id uuid not null references hotel.vendors(id) on delete restrict,
  purchase_order_id uuid references hotel.purchase_orders(id) on delete set null,
  department text not null default 'Accounts',
  bill_reference text,
  bill_date date not null default current_date,
  due_date date,
  currency text not null default 'NGN',
  fx_rate numeric(14, 6) not null default 1,
  expense_account_id uuid not null references hotel.chart_of_accounts(id) on delete restrict,
  subtotal numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  status text not null default 'draft' check (status in (
    'draft', 'pending_approval', 'approved', 'rejected', 'cancelled', 'paid'
  )),
  notes text,
  created_by uuid not null,
  approved_by uuid,
  approved_at timestamptz,
  rejection_reason text,
  journal_entry_id uuid references hotel.journal_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_vendor_bills_tenant_status on hotel.vendor_bills (tenant_id, status);
create index if not exists idx_vendor_bills_tenant_vendor on hotel.vendor_bills (tenant_id, vendor_id);

comment on table hotel.vendor_bills is 'Accounts Payable. A bill posts to the general ledger (Dr expense_account_id, Cr Accounts Payable) only once approved — draft/pending_approval bills are not yet committed spend. "paid" is reserved for M5''s payment-run work; no code path sets it yet.';

do $$
declare
  t text;
begin
  foreach t in array array['vendor_bills']
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
    execute format('drop policy if exists %I_update_member on hotel.%I', t, t);
    execute format(
      'create policy %I_update_member on hotel.%I for update to authenticated
       using (exists (select 1 from hotel.memberships m where m.tenant_id = %I.tenant_id and m.user_id = auth.uid()))',
      t, t, t
    );
  end loop;
end $$;
