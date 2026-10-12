-- Store analytics, abandoned checkouts and a light customer CRM.
--
-- Retention (agreed): raw events and abandoned-checkout contact details are
-- kept for 28 days, then deleted by store.purge_old_analytics(). Daily totals
-- are anonymous counts and are kept so charts can show longer trends. Orders,
-- and the customer list built from them, are business records and are not
-- affected.

-- What visitors do in a store. Only recorded after the visitor accepts
-- analytics cookies. No IP addresses, names or contact details.
create table if not exists store.events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  visitor_id text not null,
  session_id text not null,
  type text not null check (type in (
    'page_view', 'product_view', 'search', 'add_to_cart', 'remove_from_cart',
    'checkout_started', 'checkout_details', 'payment_started', 'app_installed'
  )),
  path text,
  product_id uuid,
  quantity integer,
  value numeric(12, 2),
  search_term text,
  referrer_host text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  device text check (device in ('mobile', 'tablet', 'desktop')),
  is_app boolean not null default false,
  country text,
  created_at timestamptz not null default now()
);

create index if not exists idx_store_events_tenant_created on store.events (tenant_id, created_at desc);
create index if not exists idx_store_events_tenant_type_created on store.events (tenant_id, type, created_at desc);

-- One row per checkout a shopper starts. Saved as they type their contact
-- details (they're told this on the checkout page), so the shop can follow up
-- by hand if they don't finish. Linked to the order once they submit.
create table if not exists store.checkouts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  token text not null,
  customer_name text,
  customer_email text,
  customer_phone text,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric(12, 2) not null default 0,
  currency text not null default 'NGN',
  session_id text,
  order_id uuid references store.orders(id) on delete set null,
  follow_up text not null default 'none' check (follow_up in ('none', 'contacted', 'recovered', 'dismissed')),
  followed_up_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, token)
);

create index if not exists idx_store_checkouts_tenant_updated on store.checkouts (tenant_id, updated_at desc);

-- Anonymous daily totals per store (counts and money only).
create table if not exists store.daily_stats (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  day date not null,
  visitors integer not null default 0,
  sessions integer not null default 0,
  page_views integer not null default 0,
  product_views integer not null default 0,
  cart_sessions integer not null default 0,
  checkout_sessions integer not null default 0,
  details_sessions integer not null default 0,
  payment_sessions integer not null default 0,
  orders integer not null default 0,
  paid_orders integer not null default 0,
  revenue numeric(14, 2) not null default 0,
  updated_at timestamptz not null default now(),
  primary key (tenant_id, day)
);

-- The shop's own notes and tags on a customer (identified by email, or phone).
create table if not exists store.customer_notes (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_key text not null,
  tags text[] not null default '{}',
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, customer_key)
);

alter table store.events enable row level security;
alter table store.events force row level security;
alter table store.checkouts enable row level security;
alter table store.checkouts force row level security;
alter table store.daily_stats enable row level security;
alter table store.daily_stats force row level security;
alter table store.customer_notes enable row level security;
alter table store.customer_notes force row level security;

do $$
declare t text;
begin
  foreach t in array array['events', 'checkouts', 'daily_stats', 'customer_notes'] loop
    execute format('drop policy if exists store_%1$s_service_role_all on store.%1$s', t);
    execute format('create policy store_%1$s_service_role_all on store.%1$s for all to public using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')', t);
  end loop;
end $$;

-- Rebuilds one day's totals for every store (safe to run again for the same day).
create or replace function store.rollup_daily_stats(p_day date)
returns void
language sql
security definer
set search_path = store, public
as $$
  insert into store.daily_stats as d (
    tenant_id, day, visitors, sessions, page_views, product_views, cart_sessions,
    checkout_sessions, details_sessions, payment_sessions, orders, paid_orders, revenue, updated_at
  )
  select
    t.tenant_id, p_day,
    coalesce(e.visitors, 0), coalesce(e.sessions, 0), coalesce(e.page_views, 0), coalesce(e.product_views, 0),
    coalesce(e.cart_sessions, 0), coalesce(e.checkout_sessions, 0), coalesce(e.details_sessions, 0), coalesce(e.payment_sessions, 0),
    coalesce(o.orders, 0), coalesce(o.paid_orders, 0), coalesce(o.revenue, 0), now()
  from (
    select tenant_id from store.events where created_at >= p_day and created_at < p_day + 1
    union
    select tenant_id from store.orders where created_at >= p_day and created_at < p_day + 1
  ) t
  left join (
    select tenant_id,
      count(distinct visitor_id) as visitors,
      count(distinct session_id) as sessions,
      count(*) filter (where type = 'page_view') as page_views,
      count(*) filter (where type = 'product_view') as product_views,
      count(distinct session_id) filter (where type = 'add_to_cart') as cart_sessions,
      count(distinct session_id) filter (where type = 'checkout_started') as checkout_sessions,
      count(distinct session_id) filter (where type = 'checkout_details') as details_sessions,
      count(distinct session_id) filter (where type = 'payment_started') as payment_sessions
    from store.events
    where created_at >= p_day and created_at < p_day + 1
    group by tenant_id
  ) e on e.tenant_id = t.tenant_id
  left join (
    select tenant_id,
      count(*) as orders,
      count(*) filter (where payment_status = 'paid') as paid_orders,
      coalesce(sum(total_amount) filter (where payment_status = 'paid'), 0) as revenue
    from store.orders
    where created_at >= p_day and created_at < p_day + 1
    group by tenant_id
  ) o on o.tenant_id = t.tenant_id
  on conflict (tenant_id, day) do update set
    visitors = excluded.visitors, sessions = excluded.sessions, page_views = excluded.page_views,
    product_views = excluded.product_views, cart_sessions = excluded.cart_sessions,
    checkout_sessions = excluded.checkout_sessions, details_sessions = excluded.details_sessions,
    payment_sessions = excluded.payment_sessions, orders = excluded.orders,
    paid_orders = excluded.paid_orders, revenue = excluded.revenue, updated_at = now();
$$;

-- Deletes raw events and abandoned-checkout details older than 28 days.
create or replace function store.purge_old_analytics()
returns void
language sql
security definer
set search_path = store, public
as $$
  delete from store.events where created_at < now() - interval '28 days';
  delete from store.checkouts where updated_at < now() - interval '28 days';
$$;

revoke all on function store.rollup_daily_stats(date) from public, anon, authenticated;
revoke all on function store.purge_old_analytics() from public, anon, authenticated;
grant execute on function store.rollup_daily_stats(date) to service_role;
grant execute on function store.purge_old_analytics() to service_role;

-- ---------------------------------------------------------------------------
-- Reporting functions for the dashboard, one store at a time. Raw events cover
-- the last 28 days, so every range the dashboard offers is counted exactly.
-- ---------------------------------------------------------------------------

create or replace function store.analytics_summary(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (
  visitors bigint, sessions bigint, page_views bigint, product_views bigint, searches bigint,
  cart_sessions bigint, checkout_sessions bigint, details_sessions bigint, payment_sessions bigint,
  app_sessions bigint, app_installs bigint, orders bigint, paid_orders bigint, revenue numeric
)
language sql stable security definer set search_path = store, public
as $$
  select
    count(distinct e.visitor_id), count(distinct e.session_id),
    count(*) filter (where e.type = 'page_view'), count(*) filter (where e.type = 'product_view'),
    count(*) filter (where e.type = 'search'),
    count(distinct e.session_id) filter (where e.type = 'add_to_cart'),
    count(distinct e.session_id) filter (where e.type = 'checkout_started'),
    count(distinct e.session_id) filter (where e.type = 'checkout_details'),
    count(distinct e.session_id) filter (where e.type = 'payment_started'),
    count(distinct e.session_id) filter (where e.is_app),
    count(*) filter (where e.type = 'app_installed'),
    (select count(*) from store.orders o where o.tenant_id = p_tenant and o.created_at >= p_from and o.created_at < p_to),
    (select count(*) from store.orders o where o.tenant_id = p_tenant and o.created_at >= p_from and o.created_at < p_to and o.payment_status = 'paid'),
    (select coalesce(sum(o.total_amount), 0) from store.orders o where o.tenant_id = p_tenant and o.created_at >= p_from and o.created_at < p_to and o.payment_status = 'paid')
  from store.events e
  where e.tenant_id = p_tenant and e.created_at >= p_from and e.created_at < p_to;
$$;

create or replace function store.analytics_daily(p_tenant uuid, p_from timestamptz, p_to timestamptz, p_tz text)
returns table (day date, visitors bigint, paid_orders bigint, revenue numeric)
language sql stable security definer set search_path = store, public
as $$
  with days as (
    select generate_series((p_from at time zone p_tz)::date, ((p_to - interval '1 second') at time zone p_tz)::date, interval '1 day')::date as day
  ),
  ev as (
    select (created_at at time zone p_tz)::date as day, count(distinct visitor_id) as visitors
    from store.events where tenant_id = p_tenant and created_at >= p_from and created_at < p_to group by 1
  ),
  ord as (
    select (created_at at time zone p_tz)::date as day, count(*) as paid_orders, sum(total_amount) as revenue
    from store.orders where tenant_id = p_tenant and created_at >= p_from and created_at < p_to and payment_status = 'paid' group by 1
  )
  select d.day, coalesce(ev.visitors, 0), coalesce(ord.paid_orders, 0), coalesce(ord.revenue, 0)
  from days d left join ev on ev.day = d.day left join ord on ord.day = d.day
  order by d.day;
$$;

create or replace function store.analytics_products(p_tenant uuid, p_from timestamptz, p_to timestamptz, p_limit integer default 10)
returns table (product_id uuid, name text, views bigint, cart_adds bigint, units_sold bigint, revenue numeric)
language sql stable security definer set search_path = store, public
as $$
  with ev as (
    select e.product_id,
      count(*) filter (where e.type = 'product_view') as views,
      count(*) filter (where e.type = 'add_to_cart') as cart_adds
    from store.events e
    where e.tenant_id = p_tenant and e.created_at >= p_from and e.created_at < p_to and e.product_id is not null
    group by e.product_id
  ),
  sold as (
    select oi.product_id, sum(oi.quantity)::bigint as units_sold, sum(oi.line_total) as revenue
    from store.order_items oi join store.orders o on o.id = oi.order_id
    where o.tenant_id = p_tenant and o.created_at >= p_from and o.created_at < p_to and o.payment_status = 'paid'
    group by oi.product_id
  )
  select p.id, p.name, coalesce(ev.views, 0), coalesce(ev.cart_adds, 0), coalesce(sold.units_sold, 0), coalesce(sold.revenue, 0)
  from store.products p
  left join ev on ev.product_id = p.id
  left join sold on sold.product_id = p.id
  where p.tenant_id = p_tenant and (ev.product_id is not null or sold.product_id is not null)
  order by coalesce(sold.revenue, 0) desc, coalesce(ev.views, 0) desc
  limit greatest(1, least(p_limit, 50));
$$;

-- Where visits came from: a campaign tag, the referring site, or direct. Paid
-- orders are credited to the visit that started their checkout.
create or replace function store.analytics_sources(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (source text, sessions bigint, checkout_sessions bigint, paid_orders bigint, revenue numeric)
language sql stable security definer set search_path = store, public
as $$
  with first_touch as (
    select distinct on (e.session_id) e.session_id,
      lower(coalesce(nullif(e.utm_source, ''), nullif(e.referrer_host, ''), 'direct')) as source
    from store.events e
    where e.tenant_id = p_tenant and e.created_at >= p_from and e.created_at < p_to
    order by e.session_id, e.created_at
  ),
  started as (
    select distinct e.session_id from store.events e
    where e.tenant_id = p_tenant and e.created_at >= p_from and e.created_at < p_to and e.type = 'checkout_started'
  ),
  paid as (
    select c.session_id, sum(o.total_amount) as amount, count(*) as orders
    from store.checkouts c join store.orders o on o.id = c.order_id
    where c.tenant_id = p_tenant and o.payment_status = 'paid' and o.created_at >= p_from and o.created_at < p_to
    group by c.session_id
  )
  select f.source, count(*), count(st.session_id), coalesce(sum(pd.orders), 0)::bigint, coalesce(sum(pd.amount), 0)
  from first_touch f
  left join started st on st.session_id = f.session_id
  left join paid pd on pd.session_id = f.session_id
  group by f.source
  order by count(*) desc
  limit 20;
$$;

create or replace function store.analytics_devices(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (device text, is_app boolean, sessions bigint)
language sql stable security definer set search_path = store, public
as $$
  select coalesce(e.device, 'desktop'), e.is_app, count(distinct e.session_id)
  from store.events e
  where e.tenant_id = p_tenant and e.created_at >= p_from and e.created_at < p_to
  group by coalesce(e.device, 'desktop'), e.is_app
  order by 3 desc;
$$;

-- Visits that came from tapping a push notification (its link carries utm_source=notification).
create or replace function store.analytics_notification_opens(p_tenant uuid, p_from timestamptz, p_to timestamptz)
returns table (campaign text, sessions bigint)
language sql stable security definer set search_path = store, public
as $$
  select coalesce(e.utm_campaign, ''), count(distinct e.session_id)
  from store.events e
  where e.tenant_id = p_tenant and e.created_at >= p_from and e.created_at < p_to and e.utm_source = 'notification'
  group by 1;
$$;

-- One row per customer (by email, or by phone when there's no email), built from their orders.
create or replace function store.customer_summaries(p_tenant uuid)
returns table (
  customer_key text, name text, email text, phone text, orders bigint, paid_orders bigint,
  total_spent numeric, first_order_at timestamptz, last_order_at timestamptz, last_paid_at timestamptz
)
language sql stable security definer set search_path = store, public
as $$
  with keyed as (
    select o.*,
      coalesce(nullif(lower(trim(o.customer_email)), ''), 'phone:' || regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g')) as k
    from store.orders o
    where o.tenant_id = p_tenant
  )
  select keyed.k,
    (array_agg(keyed.customer_name order by keyed.created_at desc))[1],
    (array_agg(keyed.customer_email order by keyed.created_at desc) filter (where keyed.customer_email is not null))[1],
    (array_agg(keyed.customer_phone order by keyed.created_at desc) filter (where coalesce(keyed.customer_phone, '') <> ''))[1],
    count(*), count(*) filter (where keyed.payment_status = 'paid'),
    coalesce(sum(keyed.total_amount) filter (where keyed.payment_status = 'paid'), 0),
    min(keyed.created_at), max(keyed.created_at), max(keyed.created_at) filter (where keyed.payment_status = 'paid')
  from keyed
  where keyed.k <> 'phone:'
  group by keyed.k;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'analytics_summary(uuid, timestamptz, timestamptz)',
    'analytics_daily(uuid, timestamptz, timestamptz, text)',
    'analytics_products(uuid, timestamptz, timestamptz, integer)',
    'analytics_sources(uuid, timestamptz, timestamptz)',
    'analytics_devices(uuid, timestamptz, timestamptz)',
    'analytics_notification_opens(uuid, timestamptz, timestamptz)',
    'customer_summaries(uuid)'
  ] loop
    execute format('revoke all on function store.%s from public, anon, authenticated', f);
    execute format('grant execute on function store.%s to service_role', f);
  end loop;
end $$;
