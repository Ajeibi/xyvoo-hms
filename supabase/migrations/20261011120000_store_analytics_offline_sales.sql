-- Count offline sales, and keep customers who left no email or phone.
--
-- Orders paid by bank transfer or cash on delivery never go through Paystack,
-- so they stay payment_status = 'unpaid' even when the shop has confirmed,
-- shipped or delivered them. Reports now count an order as a sale when it was
-- paid online, or when the shop has moved it to Confirmed, Shipped or
-- Delivered (never when it was cancelled or the online payment failed).
-- Customers without an email or phone are grouped by name.

create or replace function store.is_sale(p_payment_status text, p_status text)
returns boolean
language sql immutable
as $$
  select p_payment_status = 'paid'
    or (p_status in ('Confirmed', 'Shipped', 'Delivered') and coalesce(p_payment_status, 'unpaid') <> 'failed');
$$;

grant execute on function store.is_sale(text, text) to service_role;

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
      count(*) filter (where store.is_sale(payment_status, status)) as paid_orders,
      coalesce(sum(total_amount) filter (where store.is_sale(payment_status, status)), 0) as revenue
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
    (select count(*) from store.orders o where o.tenant_id = p_tenant and o.created_at >= p_from and o.created_at < p_to and store.is_sale(o.payment_status, o.status)),
    (select coalesce(sum(o.total_amount), 0) from store.orders o where o.tenant_id = p_tenant and o.created_at >= p_from and o.created_at < p_to and store.is_sale(o.payment_status, o.status))
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
    from store.orders where tenant_id = p_tenant and created_at >= p_from and created_at < p_to and store.is_sale(payment_status, status) group by 1
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
    where o.tenant_id = p_tenant and o.created_at >= p_from and o.created_at < p_to and store.is_sale(o.payment_status, o.status)
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
    where c.tenant_id = p_tenant and store.is_sale(o.payment_status, o.status) and o.created_at >= p_from and o.created_at < p_to
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

create or replace function store.customer_summaries(p_tenant uuid)
returns table (
  customer_key text, name text, email text, phone text, orders bigint, paid_orders bigint,
  total_spent numeric, first_order_at timestamptz, last_order_at timestamptz, last_paid_at timestamptz
)
language sql stable security definer set search_path = store, public
as $$
  with keyed as (
    select o.*,
      coalesce(
        nullif(lower(trim(o.customer_email)), ''),
        'phone:' || nullif(regexp_replace(coalesce(o.customer_phone, ''), '[^0-9]', '', 'g'), ''),
        'name:' || nullif(lower(trim(o.customer_name)), '')
      ) as k
    from store.orders o
    where o.tenant_id = p_tenant
  )
  select keyed.k,
    (array_agg(keyed.customer_name order by keyed.created_at desc))[1],
    (array_agg(keyed.customer_email order by keyed.created_at desc) filter (where keyed.customer_email is not null))[1],
    (array_agg(keyed.customer_phone order by keyed.created_at desc) filter (where coalesce(keyed.customer_phone, '') <> ''))[1],
    count(*), count(*) filter (where store.is_sale(keyed.payment_status, keyed.status)),
    coalesce(sum(keyed.total_amount) filter (where store.is_sale(keyed.payment_status, keyed.status)), 0),
    min(keyed.created_at), max(keyed.created_at), max(keyed.created_at) filter (where store.is_sale(keyed.payment_status, keyed.status))
  from keyed
  where keyed.k is not null
  group by keyed.k;
$$;
