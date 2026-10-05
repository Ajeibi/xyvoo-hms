-- Shopper-facing checkout: guest order creation + Paystack payment capture
-- for the store product. Adds payment/shipping columns to store.orders,
-- variant tracking to store.order_items, a store.payment_intents table
-- (mirrors hotel.payment_intents), and two RPC functions that own all the
-- money/stock-sensitive logic so it can run inside one transaction.
--
-- Stock is reserved (decremented) at order-creation, not at payment
-- confirmation -- decrementing only on payment success would leave a window
-- (checkout -> Paystack redirect -> return, which can be minutes) where two
-- guests could both pass a stock check on the last unit and both
-- successfully pay. Reservations expire after 30 minutes and are lazily
-- reclaimed the next time someone checks out a product that has one.

-- ---------------------------------------------------------------------------
-- store.orders / store.order_items: guest-checkout columns
-- ---------------------------------------------------------------------------

alter table store.orders
  add column if not exists payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'paid', 'failed')),
  add column if not exists shipping_address jsonb not null default '{}'::jsonb,
  add column if not exists expires_at timestamptz;

create index if not exists idx_store_orders_pending_expiry
  on store.orders (tenant_id, expires_at)
  where status = 'Pending' and payment_status = 'unpaid';

alter table store.order_items
  add column if not exists variant_id uuid references store.product_variants(id) on delete set null;

create index if not exists idx_store_order_items_variant on store.order_items (variant_id);

-- ---------------------------------------------------------------------------
-- store.payment_intents -- mirrors hotel.payment_intents. Each store tenant
-- brings their own Paystack account (public.tenants.paystack_setup), so
-- every payment intent is scoped to a tenant and an order.
-- ---------------------------------------------------------------------------

create table if not exists store.payment_intents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  order_id uuid not null references store.orders(id) on delete cascade,
  amount numeric(14, 2) not null,
  currency_code text not null default 'NGN',
  paystack_reference text not null,
  authorization_code text,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'abandoned')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists store_payment_intents_reference_idx
  on store.payment_intents (paystack_reference);
create index if not exists store_payment_intents_order_idx
  on store.payment_intents (order_id);

drop trigger if exists trg_store_payment_intents_updated_at on store.payment_intents;
create trigger trg_store_payment_intents_updated_at
before update on store.payment_intents
for each row execute function store.touch_updated_at();

alter table store.payment_intents enable row level security;
alter table store.payment_intents force row level security;

drop policy if exists store_payment_intents_service_role_all on store.payment_intents;
create policy store_payment_intents_service_role_all
on store.payment_intents
for all
to public
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists store_payment_intents_select_member on store.payment_intents;
create policy store_payment_intents_select_member
on store.payment_intents
for select
to authenticated
using (store.is_store_member(tenant_id));

-- ---------------------------------------------------------------------------
-- store.create_guest_order
--   p_customer shape: {"name": text, "email": text, "phone": text}
--   p_items shape: [{"product_id": uuid, "variant_id": uuid|null, "quantity": int}, ...]
--   Caller (the checkout API route, via the service-role client) is expected
--   to have already merged duplicate lines for the same product+variant.
-- ---------------------------------------------------------------------------

create or replace function store.create_guest_order(
  p_tenant_id uuid,
  p_customer jsonb,
  p_shipping_address jsonb,
  p_items jsonb
)
returns store.orders
language plpgsql
as $$
declare
  v_order store.orders;
  v_product_ids uuid[];
  v_reclaimed_order record;
  v_item record;
  v_product store.products;
  v_variant store.product_variants;
  v_unit_price numeric(10,2);
  v_line_total numeric(12,2);
  v_total numeric(12,2) := 0;
  v_lines jsonb := '[]'::jsonb;
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'ORDER_EMPTY' using errcode = 'P0001';
  end if;

  if coalesce(p_customer->>'name', '') = '' then
    raise exception 'CUSTOMER_NAME_REQUIRED' using errcode = 'P0001';
  end if;
  if coalesce(p_customer->>'email', '') = '' then
    raise exception 'CUSTOMER_EMAIL_REQUIRED' using errcode = 'P0001';
  end if;

  select array_agg(distinct (x.product_id))
  into v_product_ids
  from jsonb_to_recordset(p_items) as x(product_id uuid, variant_id uuid, quantity int);

  -- Lazy reclaim: release stock held by this tenant's own abandoned
  -- Pending/unpaid orders that have passed expires_at, scoped to the
  -- products this checkout needs. skip locked so a concurrent checkout
  -- reclaiming the same expired order just skips it rather than blocking.
  for v_reclaimed_order in
    select o.id
    from store.orders o
    where o.tenant_id = p_tenant_id
      and o.status = 'Pending'
      and o.payment_status = 'unpaid'
      and o.expires_at is not null
      and o.expires_at < now()
      and exists (
        select 1 from store.order_items oi
        where oi.order_id = o.id and oi.product_id = any (v_product_ids)
      )
    for update of o skip locked
  loop
    update store.product_variants pv
    set stock = pv.stock + oi.quantity
    from store.order_items oi
    where oi.order_id = v_reclaimed_order.id and oi.variant_id = pv.id;

    update store.products p
    set stock = p.stock + oi.quantity
    from store.order_items oi
    where oi.order_id = v_reclaimed_order.id
      and oi.product_id = p.id
      and oi.variant_id is null;

    update store.orders set status = 'Cancelled', updated_at = now()
    where id = v_reclaimed_order.id;
  end loop;

  -- Validate + lock + price + reserve stock, one item at a time, always in
  -- ascending (product_id, variant_id) order regardless of client-supplied
  -- array order -- this is what avoids deadlocks between two concurrent
  -- checkouts that share overlapping cart contents.
  for v_item in
    select x.product_id, x.variant_id, x.quantity
    from jsonb_to_recordset(p_items) as x(product_id uuid, variant_id uuid, quantity int)
    order by x.product_id, x.variant_id nulls first
  loop
    if v_item.quantity is null or v_item.quantity <= 0 then
      raise exception 'INVALID_QUANTITY' using errcode = 'P0001';
    end if;

    select * into v_product
    from store.products
    where id = v_item.product_id and tenant_id = p_tenant_id
    for update;

    if not found then
      raise exception 'PRODUCT_NOT_FOUND: %', v_item.product_id using errcode = 'P0001';
    end if;

    if v_product.status <> 'active'
      or v_product.visibility <> 'visible'
      or v_product.approval_status <> 'approved' then
      raise exception 'PRODUCT_UNAVAILABLE: %', v_product.name using errcode = 'P0001';
    end if;

    if v_item.quantity < v_product.minimum_order_qty then
      raise exception 'BELOW_MINIMUM_ORDER_QTY: %', v_product.name using errcode = 'P0001';
    end if;

    v_variant := null;
    if v_item.variant_id is not null then
      select * into v_variant
      from store.product_variants
      where id = v_item.variant_id and product_id = v_product.id
      for update;

      if not found then
        raise exception 'VARIANT_NOT_FOUND: %', v_item.variant_id using errcode = 'P0001';
      end if;
    end if;

    v_unit_price := coalesce(v_variant.price_override, v_product.price);

    if v_variant.id is not null then
      if not v_product.allow_backorder and v_variant.stock < v_item.quantity then
        raise exception 'INSUFFICIENT_STOCK: %', v_product.name using errcode = 'P0001';
      end if;
      update store.product_variants set stock = stock - v_item.quantity where id = v_variant.id;
    else
      if not v_product.allow_backorder and v_product.stock < v_item.quantity then
        raise exception 'INSUFFICIENT_STOCK: %', v_product.name using errcode = 'P0001';
      end if;
      update store.products set stock = stock - v_item.quantity where id = v_product.id;
    end if;

    v_line_total := v_unit_price * v_item.quantity;
    v_total := v_total + v_line_total;

    v_lines := v_lines || jsonb_build_object(
      'product_id', v_product.id,
      'variant_id', v_variant.id,
      'product_name', v_product.name,
      'quantity', v_item.quantity,
      'unit_price', v_unit_price,
      'cost_price', coalesce(v_product.cost_price, 0),
      'line_total', v_line_total
    );
  end loop;

  insert into store.orders (
    tenant_id, customer_name, customer_email, customer_phone,
    shipping_address, total_amount, status, payment_status, expires_at
  ) values (
    p_tenant_id,
    p_customer->>'name',
    p_customer->>'email',
    p_customer->>'phone',
    coalesce(p_shipping_address, '{}'::jsonb),
    v_total,
    'Pending',
    'unpaid',
    now() + interval '30 minutes'
  )
  returning * into v_order;

  insert into store.order_items (
    order_id, product_id, variant_id, product_name, quantity, unit_price, cost_price, line_total
  )
  select
    v_order.id,
    (l->>'product_id')::uuid,
    (l->>'variant_id')::uuid,
    l->>'product_name',
    (l->>'quantity')::int,
    (l->>'unit_price')::numeric,
    (l->>'cost_price')::numeric,
    (l->>'line_total')::numeric
  from jsonb_array_elements(v_lines) l;

  return v_order;
end;
$$;

-- ---------------------------------------------------------------------------
-- store.mark_order_paid -- idempotent; stock is NOT touched here, it was
-- already reserved (decremented) in create_guest_order.
-- ---------------------------------------------------------------------------

create or replace function store.mark_order_paid(
  p_order_id uuid,
  p_paystack_reference text
)
returns void
language plpgsql
as $$
declare
  v_order store.orders;
begin
  select * into v_order from store.orders where id = p_order_id for update;

  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_order.payment_status = 'paid' then
    return; -- idempotent no-op: safe to call from both the redirect-verify
            -- route and the webhook, whichever arrives first wins.
  end if;

  -- v_order.status = 'Cancelled' here means the reservation had already
  -- expired and been reclaimed (see create_guest_order) before this
  -- payment landed -- its stock may already be resold. We still record the
  -- payment (don't silently drop captured money) but leave status alone;
  -- payment_status='paid' next to status='Cancelled' is the deliberate
  -- signal for manual merchant reconciliation of that rare edge case.

  update store.orders
  set payment_status = 'paid', updated_at = now()
  where id = p_order_id;

  update store.payment_intents
  set status = 'success', updated_at = now()
  where order_id = p_order_id and paystack_reference = p_paystack_reference;
end;
$$;

-- ---------------------------------------------------------------------------
-- Lock these down: the foundation migration
-- (20260810160000_store_schema_grants.sql) grants execute on all store.*
-- routines to anon/authenticated by default. These two move money and
-- stock and must only ever be reachable via the checkout API routes'
-- service-role client.
--
-- PUBLIC must be revoked too, not just anon/authenticated -- Postgres
-- auto-grants EXECUTE to PUBLIC on every new function unless it's
-- explicitly revoked, and every role (including anon/authenticated)
-- implicitly inherits whatever PUBLIC has. Revoking only from the named
-- roles leaves the function callable via that implicit PUBLIC grant.
-- ---------------------------------------------------------------------------

revoke execute on function store.create_guest_order(uuid, jsonb, jsonb, jsonb) from public;
revoke execute on function store.mark_order_paid(uuid, text) from public;
revoke execute on function store.create_guest_order(uuid, jsonb, jsonb, jsonb) from anon, authenticated;
revoke execute on function store.mark_order_paid(uuid, text) from anon, authenticated;
grant execute on function store.create_guest_order(uuid, jsonb, jsonb, jsonb) to service_role;
grant execute on function store.mark_order_paid(uuid, text) to service_role;
