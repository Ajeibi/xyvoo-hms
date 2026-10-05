-- Accounts Phase 2, M6: customer invoicing, AR aging, and the guest-folio/city-ledger
-- tie-in. Unlike a vendor bill, an invoice has no approval gate — raising it recognizes
-- revenue already earned, so it posts to the ledger immediately (Dr the AR/City Ledger
-- account, Cr the chosen revenue account). ar_account_id is stored per invoice (not
-- resolved by a fixed code like vendor bills' Accounts Payable) because which control
-- account applies genuinely varies: a reservation-linked invoice uses City Ledger (1300),
-- a standalone one uses Accounts Receivable (1100) — see customer-invoices.ts.

create table if not exists hotel.ar_customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  contact_name text,
  phone text,
  email text,
  address text,
  currency text not null default 'NGN',
  payment_terms text,
  credit_limit numeric(14, 2),
  status text not null default 'active' check (status in ('active', 'inactive')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ar_customers_tenant_status on hotel.ar_customers (tenant_id, status);

comment on table hotel.ar_customers is 'Accounts Receivable customer register — corporate accounts and travel agents billed on terms, mirroring hotel.vendors on the payable side.';

create table if not exists hotel.customer_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  invoice_number text not null,
  customer_id uuid not null references hotel.ar_customers(id) on delete restrict,
  reservation_id uuid references hotel.reservations(id) on delete set null,
  department text not null default 'Front Desk',
  invoice_date date not null default current_date,
  due_date date,
  currency text not null default 'NGN',
  revenue_account_id uuid not null references hotel.chart_of_accounts(id) on delete restrict,
  ar_account_id uuid not null references hotel.chart_of_accounts(id) on delete restrict,
  subtotal numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  status text not null default 'open' check (status in ('open', 'paid', 'cancelled')),
  notes text,
  created_by uuid not null,
  journal_entry_id uuid references hotel.journal_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, invoice_number)
);

create index if not exists idx_customer_invoices_tenant_status on hotel.customer_invoices (tenant_id, status);
create index if not exists idx_customer_invoices_tenant_customer on hotel.customer_invoices (tenant_id, customer_id);
create index if not exists idx_customer_invoices_reservation on hotel.customer_invoices (reservation_id);

comment on table hotel.customer_invoices is 'Posts to the ledger immediately on creation (Dr ar_account_id, Cr revenue_account_id) — there is no approval step, unlike vendor_bills.';

create table if not exists hotel.customer_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_date date not null default current_date,
  bank_account_id uuid not null references hotel.chart_of_accounts(id) on delete restrict,
  reference text,
  total numeric(14, 2) not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_invoice_payments_tenant on hotel.customer_invoice_payments (tenant_id, payment_date desc);

create table if not exists hotel.customer_invoice_payment_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  payment_id uuid not null references hotel.customer_invoice_payments(id) on delete cascade,
  customer_invoice_id uuid not null references hotel.customer_invoices(id) on delete restrict,
  amount numeric(14, 2) not null default 0,
  journal_entry_id uuid references hotel.journal_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (customer_invoice_id)
);

create index if not exists idx_civ_payment_lines_tenant_payment on hotel.customer_invoice_payment_lines (tenant_id, payment_id);

comment on table hotel.customer_invoice_payment_lines is 'One row per invoice received in a run, mirroring vendor_bill_payment_lines. unique(customer_invoice_id): an invoice is received in full, once — no partial-payment support yet.';

do $$
declare
  t text;
begin
  foreach t in array array[
    'ar_customers', 'customer_invoices', 'customer_invoice_payments', 'customer_invoice_payment_lines'
  ]
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
