-- Room assets inventory + smart lock tenant config

alter table public.tenants
  add column if not exists smart_lock_setup jsonb not null default '{}'::jsonb;

create table if not exists hotel.room_unit_assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_unit_id uuid not null references hotel.room_units(id) on delete cascade,
  asset_type text not null default 'other'
    check (asset_type in ('tv', 'minibar', 'safe', 'phone', 'ac', 'other')),
  label text not null,
  serial_number text,
  condition text not null default 'good'
    check (condition in ('good', 'fair', 'poor', 'missing', 'replaced')),
  last_inspected_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_room_unit_assets_room on hotel.room_unit_assets (tenant_id, room_unit_id);

alter table hotel.room_unit_assets enable row level security;

create policy room_unit_assets_tenant on hotel.room_unit_assets
  for all using (
    tenant_id in (
      select tenant_id from hotel.memberships where user_id = auth.uid()
    )
  );
