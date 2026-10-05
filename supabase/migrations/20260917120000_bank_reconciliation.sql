-- Bank reconciliation: confirms the ledger actually agrees with what the bank shows. A "bank
-- account" is any chart_of_accounts row with is_cash_equivalent = true (added in the previous
-- migration) — there's no separate bank-account entity.
--
-- Design-review finding: nothing stopped is_cash_equivalent from being set on a non-asset
-- account, which would silently break both this feature's matching (bank postings are always
-- debit-on-receipt/credit-on-payment by position, assuming an asset) and the Cash Flow Statement
-- (which already assumes asset-sign for cash accounts). Fixed here since no UI to set these flags
-- exists yet, so no existing data can violate it.
alter table hotel.chart_of_accounts
  add constraint chk_cash_equivalent_is_asset check (not is_cash_equivalent or type = 'asset');

create table if not exists hotel.bank_reconciliations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  account_id uuid not null references hotel.chart_of_accounts(id),
  period_end_date date not null,
  statement_ending_balance numeric(14,2) not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  final_difference numeric(14,2),
  created_by uuid not null,
  completed_by uuid,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_bank_reconciliations_tenant_account
  on hotel.bank_reconciliations (tenant_id, account_id, period_end_date desc);

comment on table hotel.bank_reconciliations is
  'One reconciliation session per bank/cash account per statement period. status=completed sessions should be reopened, not mutated directly, before unmatching a line.';

create table if not exists hotel.bank_reconciliation_lines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reconciliation_id uuid not null references hotel.bank_reconciliations(id) on delete cascade,
  line_date date not null,
  description text not null,
  amount numeric(14,2) not null,
  reference text,
  created_at timestamptz not null default now()
);
create index if not exists idx_bank_reconciliation_lines_recon
  on hotel.bank_reconciliation_lines (tenant_id, reconciliation_id);

comment on column hotel.bank_reconciliation_lines.amount is
  'Signed per the bank''s own statement convention: positive = money in (deposit), negative = money out (withdrawal) — independent of whichever column headers the source file used.';

create table if not exists hotel.bank_reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reconciliation_line_id uuid not null references hotel.bank_reconciliation_lines(id) on delete cascade,
  journal_entry_line_id uuid not null references hotel.journal_entry_lines(id),
  matched_at timestamptz not null default now(),
  matched_by uuid not null
);
-- A ledger line can only ever clear the bank once, across every reconciliation that has ever
-- run — this is what makes many-to-one matching (one statement line, several journal lines,
-- e.g. a batched card-processor payout) safe without also allowing double-counting.
create unique index if not exists uq_bank_recon_matches_je_line
  on hotel.bank_reconciliation_matches (journal_entry_line_id);
create index if not exists idx_bank_recon_matches_line
  on hotel.bank_reconciliation_matches (tenant_id, reconciliation_line_id);

comment on table hotel.bank_reconciliation_matches is
  'Join table: one reconciliation line can match several journal_entry_lines (many-to-one), but a journal_entry_line can only ever appear once across all reconciliations (enforced by the unique index).';

-- Note on deletion: bank_reconciliations and bank_reconciliation_lines are never deleted (no
-- delete policy) — same audit-trail ethos as journal entries. bank_reconciliation_matches is
-- different: a match is administrative metadata linking an existing, untouched ledger line to a
-- statement line, not a financial record itself, so "unmatch" is a real delete of that link
-- (not a reconciliation, not a journal entry) — hence the delete policy below, scoped to this
-- table only.

alter table hotel.bank_reconciliations enable row level security;
alter table hotel.bank_reconciliations force row level security;
alter table hotel.bank_reconciliation_lines enable row level security;
alter table hotel.bank_reconciliation_lines force row level security;
alter table hotel.bank_reconciliation_matches enable row level security;
alter table hotel.bank_reconciliation_matches force row level security;

drop policy if exists bank_reconciliations_service_role_all on hotel.bank_reconciliations;
create policy bank_reconciliations_service_role_all on hotel.bank_reconciliations for all to public using (true) with check (true);
drop policy if exists bank_reconciliations_select_member on hotel.bank_reconciliations;
create policy bank_reconciliations_select_member on hotel.bank_reconciliations for select to authenticated
  using (exists (select 1 from hotel.memberships m where m.tenant_id = bank_reconciliations.tenant_id and m.user_id = auth.uid()));
drop policy if exists bank_reconciliations_insert_member on hotel.bank_reconciliations;
create policy bank_reconciliations_insert_member on hotel.bank_reconciliations for insert to authenticated
  with check (exists (select 1 from hotel.memberships m where m.tenant_id = bank_reconciliations.tenant_id and m.user_id = auth.uid()));
drop policy if exists bank_reconciliations_update_member on hotel.bank_reconciliations;
create policy bank_reconciliations_update_member on hotel.bank_reconciliations for update to authenticated
  using (exists (select 1 from hotel.memberships m where m.tenant_id = bank_reconciliations.tenant_id and m.user_id = auth.uid()));

drop policy if exists bank_reconciliation_lines_service_role_all on hotel.bank_reconciliation_lines;
create policy bank_reconciliation_lines_service_role_all on hotel.bank_reconciliation_lines for all to public using (true) with check (true);
drop policy if exists bank_reconciliation_lines_select_member on hotel.bank_reconciliation_lines;
create policy bank_reconciliation_lines_select_member on hotel.bank_reconciliation_lines for select to authenticated
  using (exists (select 1 from hotel.memberships m where m.tenant_id = bank_reconciliation_lines.tenant_id and m.user_id = auth.uid()));
drop policy if exists bank_reconciliation_lines_insert_member on hotel.bank_reconciliation_lines;
create policy bank_reconciliation_lines_insert_member on hotel.bank_reconciliation_lines for insert to authenticated
  with check (exists (select 1 from hotel.memberships m where m.tenant_id = bank_reconciliation_lines.tenant_id and m.user_id = auth.uid()));

drop policy if exists bank_recon_matches_service_role_all on hotel.bank_reconciliation_matches;
create policy bank_recon_matches_service_role_all on hotel.bank_reconciliation_matches for all to public using (true) with check (true);
drop policy if exists bank_recon_matches_select_member on hotel.bank_reconciliation_matches;
create policy bank_recon_matches_select_member on hotel.bank_reconciliation_matches for select to authenticated
  using (exists (select 1 from hotel.memberships m where m.tenant_id = bank_reconciliation_matches.tenant_id and m.user_id = auth.uid()));
drop policy if exists bank_recon_matches_insert_member on hotel.bank_reconciliation_matches;
create policy bank_recon_matches_insert_member on hotel.bank_reconciliation_matches for insert to authenticated
  with check (exists (select 1 from hotel.memberships m where m.tenant_id = bank_reconciliation_matches.tenant_id and m.user_id = auth.uid()));
drop policy if exists bank_recon_matches_delete_member on hotel.bank_reconciliation_matches;
create policy bank_recon_matches_delete_member on hotel.bank_reconciliation_matches for delete to authenticated
  using (exists (select 1 from hotel.memberships m where m.tenant_id = bank_reconciliation_matches.tenant_id and m.user_id = auth.uid()));
