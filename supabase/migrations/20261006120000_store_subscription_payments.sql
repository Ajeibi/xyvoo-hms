-- Standard plan billing on XYVOO's own Paystack account.
--
-- Paystack identifies a subscription by its code plus an email token, and
-- both are needed to cancel it, so the token is stored alongside the code.
-- store.subscription_payments records each sign-up payment we start, so the
-- return page and the webhook can confirm it against our own records rather
-- than trusting anything in the request.

alter table store.subscriptions
  add column if not exists paystack_email_token text;

create table if not exists store.subscription_payments (
  reference text primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  plan text not null check (plan in ('standard')),
  amount numeric(12,2) not null check (amount > 0),
  currency_code text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'abandoned')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_store_subscription_payments_tenant on store.subscription_payments (tenant_id, created_at desc);

alter table store.subscription_payments enable row level security;
alter table store.subscription_payments force row level security;

drop policy if exists store_subscription_payments_service_role_all on store.subscription_payments;
create policy store_subscription_payments_service_role_all on store.subscription_payments
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_subscription_payments_select_member on store.subscription_payments;
create policy store_subscription_payments_select_member on store.subscription_payments
for select to authenticated using (store.is_store_member(tenant_id));

create index if not exists idx_store_subscriptions_customer_code
  on store.subscriptions (paystack_customer_code) where paystack_customer_code is not null;
