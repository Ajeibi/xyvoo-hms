-- Push notifications for store apps. Customers who install a store's app (or
-- allow notifications in their browser) are saved here per store, and the
-- store owner can send them a notification from the dashboard.

create table if not exists store.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (tenant_id, endpoint)
);

create index if not exists idx_store_push_subscriptions_tenant on store.push_subscriptions (tenant_id);

-- What each store has sent, for the dashboard history and the daily limit.
create table if not exists store.push_notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  title text not null,
  body text not null,
  path text not null default '/',
  sent_by uuid references auth.users(id) on delete set null,
  recipients integer not null default 0,
  delivered integer not null default 0,
  failed integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_store_push_notifications_tenant on store.push_notifications (tenant_id, created_at desc);

alter table store.push_subscriptions enable row level security;
alter table store.push_subscriptions force row level security;
alter table store.push_notifications enable row level security;
alter table store.push_notifications force row level security;

-- Subscriptions hold device push addresses: only the server touches them.
drop policy if exists store_push_subscriptions_service_role_all on store.push_subscriptions;
create policy store_push_subscriptions_service_role_all on store.push_subscriptions
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists store_push_notifications_service_role_all on store.push_notifications;
create policy store_push_notifications_service_role_all on store.push_notifications
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
drop policy if exists store_push_notifications_select_member on store.push_notifications;
create policy store_push_notifications_select_member on store.push_notifications
for select to authenticated using (store.is_store_member(tenant_id));
