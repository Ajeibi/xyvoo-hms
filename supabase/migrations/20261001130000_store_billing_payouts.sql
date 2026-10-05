-- Storefront plans and payouts.
--
-- Every store takes payments through XYVOO's Paystack account with the store
-- as a Paystack subaccount (split payments). XYVOO's share is the plan's
-- platform fee: Free 4%, Standard 0%, Enterprise agreed per tenant.
--
-- Rates are fractions (0.0400 = 4%) to match store.orders.platform_fee_percentage.
-- Paystack's subaccount percentage_charge is a percentage (4), so convert in the app.
-- Platform Paystack keys live only in environment variables, never here.

create table if not exists store.subscriptions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'standard', 'enterprise')),
  status text not null default 'active'
    check (status in ('active', 'pending_payment', 'past_due', 'cancelled')),
  platform_fee_rate numeric(5,4) not null default 0.0400
    check (platform_fee_rate >= 0 and platform_fee_rate <= 1),
  paystack_customer_code text,
  paystack_subscription_code text,
  current_period_end timestamptz,
  -- When a failed Standard renewal drops the store back to Free.
  grace_ends_at timestamptz,
  cancelled_at timestamptz,
  -- Enterprise enquiries waiting on sales: {"name", "phone", "message", "submitted_at"}.
  enterprise_enquiry jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_store_subscriptions_paystack_code
  on store.subscriptions (paystack_subscription_code) where paystack_subscription_code is not null;

drop trigger if exists trg_store_subscriptions_updated_at on store.subscriptions;
create trigger trg_store_subscriptions_updated_at
before update on store.subscriptions
for each row execute function store.touch_updated_at();

-- Only the masked account number is kept. Paystack holds the full details.
create table if not exists store.payout_accounts (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  subaccount_code text not null unique,
  business_name text not null,
  bank_code text not null,
  bank_name text not null,
  account_name text not null,
  account_number_last4 text not null check (account_number_last4 ~ '^[0-9]{4}$'),
  is_active boolean not null default true,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_store_payout_accounts_updated_at on store.payout_accounts;
create trigger trg_store_payout_accounts_updated_at
before update on store.payout_accounts
for each row execute function store.touch_updated_at();

-- Lets checkout record which subaccount a payment was split to.
alter table store.payment_intents
  add column if not exists subaccount_code text;

alter table store.subscriptions enable row level security;
alter table store.subscriptions force row level security;
alter table store.payout_accounts enable row level security;
alter table store.payout_accounts force row level security;

drop policy if exists store_subscriptions_service_role_all on store.subscriptions;
create policy store_subscriptions_service_role_all on store.subscriptions
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_subscriptions_select_member on store.subscriptions;
create policy store_subscriptions_select_member on store.subscriptions
for select to authenticated using (store.is_store_member(tenant_id));

drop policy if exists store_payout_accounts_service_role_all on store.payout_accounts;
create policy store_payout_accounts_service_role_all on store.payout_accounts
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_payout_accounts_select_member on store.payout_accounts;
create policy store_payout_accounts_select_member on store.payout_accounts
for select to authenticated using (store.is_store_member(tenant_id));

-- Existing stores start on Free.
insert into store.subscriptions (tenant_id)
select t.id
from public.tenants t
where t.product = 'store'
on conflict (tenant_id) do nothing;
