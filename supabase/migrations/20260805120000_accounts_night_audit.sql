-- Accounts Phase 3, M9 (brought forward): night-audit journal automation. Bridges the
-- gap where day-to-day guest folio activity (room charges, F&B, payments) and walk-in
-- F&B POS sales never touched the general ledger at all — until now, only vendor bills
-- and manually-raised customer invoices posted anything. One row per tenant per date;
-- the linked journal entry is the actual posting (reversible via the existing
-- reverseJournalEntry, same as any other entry) — this table just records that the day
-- was audited and what the computed totals were, for the run-history view.

create table if not exists hotel.night_audit_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  audit_date date not null,
  journal_entry_id uuid references hotel.journal_entries(id) on delete set null,
  room_revenue numeric(14, 2) not null default 0,
  fb_revenue numeric(14, 2) not null default 0,
  other_revenue numeric(14, 2) not null default 0,
  unclassified_revenue numeric(14, 2) not null default 0,
  cash_total numeric(14, 2) not null default 0,
  card_total numeric(14, 2) not null default 0,
  city_ledger_total numeric(14, 2) not null default 0,
  guest_ledger_net numeric(14, 2) not null default 0,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, audit_date)
);

create index if not exists idx_night_audit_runs_tenant_date on hotel.night_audit_runs (tenant_id, audit_date desc);

comment on table hotel.night_audit_runs is 'One row per date actually audited. To redo a date, reverse its linked journal entry first (existing reverseJournalEntry) — the audit can then re-run for that date.';

do $$
begin
  execute 'alter table hotel.night_audit_runs enable row level security';
  execute 'alter table hotel.night_audit_runs force row level security';

  execute 'drop policy if exists night_audit_runs_service_role_all on hotel.night_audit_runs';
  execute 'create policy night_audit_runs_service_role_all on hotel.night_audit_runs for all to public using (true) with check (true)';

  execute 'drop policy if exists night_audit_runs_select_member on hotel.night_audit_runs';
  execute $q$create policy night_audit_runs_select_member on hotel.night_audit_runs for select to authenticated
    using (exists (select 1 from hotel.memberships m where m.tenant_id = night_audit_runs.tenant_id and m.user_id = auth.uid()))$q$;

  execute 'drop policy if exists night_audit_runs_insert_member on hotel.night_audit_runs';
  execute $q$create policy night_audit_runs_insert_member on hotel.night_audit_runs for insert to authenticated
    with check (exists (select 1 from hotel.memberships m where m.tenant_id = night_audit_runs.tenant_id and m.user_id = auth.uid()))$q$;
end $$;
