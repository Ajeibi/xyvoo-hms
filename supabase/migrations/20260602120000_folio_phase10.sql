-- Phase 10: Folio line items, cash float, tenant folio settings

alter table hotel.folio_transactions drop constraint if exists folio_transactions_method_check;
alter table hotel.folio_transactions add constraint folio_transactions_method_check check (
  method in ('cash', 'card', 'split', 'direct_bill', 'refund', 'system')
);

alter table hotel.folio_transactions add column if not exists kind text not null default 'payment'
  check (kind in ('charge', 'payment', 'discount', 'refund', 'transfer'));

alter table hotel.folio_transactions add column if not exists description text;
alter table hotel.folio_transactions add column if not exists department text;
alter table hotel.folio_transactions add column if not exists posted_by uuid;
alter table hotel.folio_transactions add column if not exists voided_at timestamptz;
alter table hotel.folio_transactions add column if not exists voided_by uuid;
alter table hotel.folio_transactions add column if not exists void_reason text;
alter table hotel.folio_transactions add column if not exists currency_code text not null default 'NGN';
alter table hotel.folio_transactions add column if not exists fx_rate numeric(14, 6);
alter table hotel.folio_transactions add column if not exists original_amount numeric(14, 2);
alter table hotel.folio_transactions add column if not exists original_currency text;
alter table hotel.folio_transactions add column if not exists split_leg text not null default 'guest'
  check (split_leg in ('guest', 'company'));
alter table hotel.folio_transactions add column if not exists related_reservation_id uuid references hotel.reservations(id) on delete set null;
alter table hotel.folio_transactions add column if not exists cash_float_session_id uuid;
alter table hotel.folio_transactions add column if not exists metadata jsonb not null default '{}'::jsonb;

update hotel.folio_transactions set kind = 'payment' where kind is null or kind = 'payment';
update hotel.folio_transactions set amount = -abs(amount) where kind = 'payment' and amount > 0;
update hotel.folio_transactions set kind = 'charge', amount = abs(amount) where amount > 0 and (kind is null or kind = 'payment');

create index if not exists idx_folio_tx_tenant_created on hotel.folio_transactions (tenant_id, created_at desc);

create table if not exists hotel.cash_float_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  opened_by uuid not null,
  opened_at timestamptz not null default now(),
  opening_balance numeric(14, 2) not null default 0,
  closed_at timestamptz,
  closed_by uuid,
  closing_balance numeric(14, 2),
  expected_balance numeric(14, 2),
  variance numeric(14, 2),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_cash_float_tenant_open on hotel.cash_float_sessions (tenant_id) where closed_at is null;

alter table hotel.folio_transactions
  add constraint folio_tx_cash_float_fk foreign key (cash_float_session_id)
  references hotel.cash_float_sessions(id) on delete set null;

create table if not exists hotel.tenant_folio_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  manager_pin_hash text,
  allow_checkout_with_balance boolean not null default false,
  large_charge_threshold numeric(14, 2) not null default 50000,
  updated_at timestamptz not null default now()
);

alter table hotel.cash_float_sessions enable row level security;
alter table hotel.tenant_folio_settings enable row level security;
alter table hotel.cash_float_sessions force row level security;
alter table hotel.tenant_folio_settings force row level security;

drop policy if exists cash_float_service_role_all on hotel.cash_float_sessions;
create policy cash_float_service_role_all on hotel.cash_float_sessions for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists cash_float_select_member on hotel.cash_float_sessions;
create policy cash_float_select_member on hotel.cash_float_sessions for select to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = cash_float_sessions.tenant_id and m.user_id = auth.uid()));

drop policy if exists tenant_folio_settings_service_role_all on hotel.tenant_folio_settings;
create policy tenant_folio_settings_service_role_all on hotel.tenant_folio_settings for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists tenant_folio_settings_select_member on hotel.tenant_folio_settings;
create policy tenant_folio_settings_select_member on hotel.tenant_folio_settings for select to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = tenant_folio_settings.tenant_id and m.user_id = auth.uid()));

do $$
begin
  alter publication supabase_realtime add table hotel.folio_transactions;
exception when duplicate_object then null;
end $$;
