-- POS folio method + Paystack tenant config + payment intents

alter table hotel.folio_transactions drop constraint if exists folio_transactions_method_check;
alter table hotel.folio_transactions
  add constraint folio_transactions_method_check
  check (method in ('cash', 'card', 'pos', 'split', 'direct_bill', 'refund', 'system'));

alter table public.tenants
  add column if not exists paystack_setup jsonb not null default '{}'::jsonb;

comment on column public.tenants.paystack_setup is
  'Per-hotel Paystack keys: enabled, mode (test|live), publicKey, secretKey, webhookSecret';

create table if not exists hotel.payment_intents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reservation_id uuid references hotel.reservations(id) on delete set null,
  amount numeric(14, 2) not null,
  currency_code text not null default 'NGN',
  purpose text not null check (purpose in ('folio_charge', 'preauth', 'registration')),
  paystack_reference text not null,
  authorization_code text,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'abandoned')),
  folio_transaction_id uuid references hotel.folio_transactions(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists payment_intents_paystack_reference_idx
  on hotel.payment_intents (paystack_reference);

create index if not exists payment_intents_tenant_reservation_status_idx
  on hotel.payment_intents (tenant_id, reservation_id, status);

comment on table hotel.payment_intents is
  'Paystack payment lifecycle: initialize → webhook/verify → folio line';
