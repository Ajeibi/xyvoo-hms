-- Accounts Phase 1 (ledger foundation): chart of accounts, double-entry journal
-- entries, and journal lines with dimensional tagging (department). Balance
-- validation (sum(debit) = sum(credit) per entry) is enforced in the application
-- layer (journal-entries.ts), matching how other business rules in this codebase
-- are enforced (room-status transitions, task status machines) rather than triggers.

create table if not exists hotel.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,
  name text not null,
  type text not null check (type in ('asset', 'liability', 'equity', 'revenue', 'expense')),
  parent_id uuid references hotel.chart_of_accounts(id) on delete set null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists idx_coa_tenant_active on hotel.chart_of_accounts (tenant_id, is_active);

comment on table hotel.chart_of_accounts is 'Per-tenant chart of accounts. type determines normal balance and statement placement in the application layer.';

create table if not exists hotel.journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  entry_date date not null default current_date,
  memo text not null,
  reference text,
  reversed_of uuid references hotel.journal_entries(id) on delete set null,
  reversed_by uuid references hotel.journal_entries(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_je_tenant_date on hotel.journal_entries (tenant_id, entry_date desc);

comment on table hotel.journal_entries is 'A balanced double-entry posting. Corrections happen via a linked reversing entry (reversed_of/reversed_by), never by editing a posted entry.';

create table if not exists hotel.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  journal_entry_id uuid not null references hotel.journal_entries(id) on delete cascade,
  account_id uuid not null references hotel.chart_of_accounts(id) on delete restrict,
  line_no int not null default 0,
  department text,
  description text,
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index if not exists idx_jel_tenant_entry on hotel.journal_entry_lines (tenant_id, journal_entry_id);
create index if not exists idx_jel_tenant_account on hotel.journal_entry_lines (tenant_id, account_id);

comment on table hotel.journal_entry_lines is 'Each line moves exactly one account, in exactly one direction. department is a free dimension tag (Kitchen/Bar/Housekeeping/etc.), not a foreign key, matching Procurement''s cost-centre model.';

do $$
declare
  t text;
begin
  foreach t in array array['chart_of_accounts', 'journal_entries', 'journal_entry_lines']
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
