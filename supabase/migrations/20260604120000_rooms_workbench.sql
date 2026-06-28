-- Front desk rooms workbench: blocks, connecting rooms, notes, incidents, key events, HK priority

alter table hotel.housekeeping_tasks
  add column if not exists priority_level text not null default 'normal'
    check (priority_level in ('normal', 'high', 'urgent', 'vip'));

alter table hotel.housekeeping_tasks
  add column if not exists due_by timestamptz;

create table if not exists hotel.room_blocks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_unit_id uuid not null references hotel.room_units(id) on delete cascade,
  block_type text not null default 'temporary'
    check (block_type in ('temporary', 'permanent', 'soft', 'maintenance_hold')),
  reason text not null,
  start_at timestamptz not null default now(),
  end_at timestamptz,
  notes text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_room_blocks_tenant_room on hotel.room_blocks (tenant_id, room_unit_id);
create index if not exists idx_room_blocks_active on hotel.room_blocks (tenant_id, active) where active = true;

create table if not exists hotel.room_connecting_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_unit_id_a uuid not null references hotel.room_units(id) on delete cascade,
  room_unit_id_b uuid not null references hotel.room_units(id) on delete cascade,
  created_by uuid,
  created_at timestamptz not null default now(),
  check (room_unit_id_a <> room_unit_id_b),
  unique (tenant_id, room_unit_id_a, room_unit_id_b)
);

create index if not exists idx_room_connecting_tenant on hotel.room_connecting_links (tenant_id);

create table if not exists hotel.room_unit_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_unit_id uuid not null references hotel.room_units(id) on delete cascade,
  body text not null,
  author_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_room_unit_notes_room on hotel.room_unit_notes (tenant_id, room_unit_id);

create table if not exists hotel.room_incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_unit_id uuid not null references hotel.room_units(id) on delete cascade,
  reservation_id uuid references hotel.reservations(id) on delete set null,
  incident_type text not null,
  description text not null,
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  resolution text,
  reported_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_room_incidents_room on hotel.room_incidents (tenant_id, room_unit_id);

create table if not exists hotel.room_key_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_unit_id uuid not null references hotel.room_units(id) on delete cascade,
  reservation_id uuid references hotel.reservations(id) on delete set null,
  event_type text not null check (event_type in ('remote_unlock', 'key_deactivated', 'key_reissued')),
  reason text not null,
  staff_user_id uuid not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_room_key_events_room on hotel.room_key_events (tenant_id, room_unit_id, created_at desc);

alter table hotel.room_blocks enable row level security;
alter table hotel.room_connecting_links enable row level security;
alter table hotel.room_unit_notes enable row level security;
alter table hotel.room_incidents enable row level security;
alter table hotel.room_key_events enable row level security;

alter table hotel.room_blocks force row level security;
alter table hotel.room_connecting_links force row level security;
alter table hotel.room_unit_notes force row level security;
alter table hotel.room_incidents force row level security;
alter table hotel.room_key_events force row level security;

drop policy if exists room_blocks_service_role_all on hotel.room_blocks;
create policy room_blocks_service_role_all on hotel.room_blocks for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists room_connecting_links_service_role_all on hotel.room_connecting_links;
create policy room_connecting_links_service_role_all on hotel.room_connecting_links for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists room_unit_notes_service_role_all on hotel.room_unit_notes;
create policy room_unit_notes_service_role_all on hotel.room_unit_notes for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists room_incidents_service_role_all on hotel.room_incidents;
create policy room_incidents_service_role_all on hotel.room_incidents for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists room_key_events_service_role_all on hotel.room_key_events;
create policy room_key_events_service_role_all on hotel.room_key_events for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
