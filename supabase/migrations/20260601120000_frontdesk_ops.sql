-- Front desk operations: notifications, audit, shift notes, housekeeping, room flags, guest tags

-- Extend room status values
alter table hotel.room_units drop constraint if exists room_units_status_check;
alter table hotel.room_units add constraint room_units_status_check check (
  status in (
    'occupied', 'vacant_clean', 'dirty', 'inspected', 'maintenance', 'out_of_order',
    'cleaning_in_progress', 'ready_for_occupancy'
  )
);

alter table hotel.guests add column if not exists tags jsonb not null default '[]'::jsonb;

create table if not exists hotel.room_unit_flags (
  room_unit_id uuid primary key references hotel.room_units(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  dnd boolean not null default false,
  security_hold boolean not null default false,
  staff_restricted boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists idx_room_unit_flags_tenant on hotel.room_unit_flags (tenant_id);

create table if not exists hotel.notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info', 'warning', 'critical')),
  entity_type text,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_notifications_tenant_created on hotel.notifications (tenant_id, created_at desc);
create index if not exists idx_notifications_tenant_unread on hotel.notifications (tenant_id) where read_at is null;

create table if not exists hotel.audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_tenant_created on hotel.audit_logs (tenant_id, created_at desc);

create table if not exists hotel.shift_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  author_user_id uuid not null,
  body text not null,
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  shift_date date not null default (current_date),
  room_unit_id uuid references hotel.room_units(id) on delete set null,
  reservation_id uuid references hotel.reservations(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_shift_notes_tenant_date on hotel.shift_notes (tenant_id, shift_date desc);

create table if not exists hotel.housekeeping_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_unit_id uuid not null references hotel.room_units(id) on delete cascade,
  status text not null default 'dirty' check (
    status in ('dirty', 'cleaning_in_progress', 'cleaned', 'inspected', 'ready')
  ),
  assigned_staff_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  inspected_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  unique (room_unit_id)
);

create index if not exists idx_hk_tasks_tenant on hotel.housekeeping_tasks (tenant_id);

create table if not exists hotel.folio_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reservation_id uuid not null references hotel.reservations(id) on delete cascade,
  amount numeric(14, 2) not null,
  method text not null check (method in ('cash', 'card', 'split', 'direct_bill', 'refund')),
  status text not null default 'posted' check (status in ('posted', 'pending', 'failed', 'refund_pending')),
  reference text,
  created_at timestamptz not null default now()
);

create index if not exists idx_folio_tx_res on hotel.folio_transactions (reservation_id);

-- RLS
alter table hotel.room_unit_flags enable row level security;
alter table hotel.notifications enable row level security;
alter table hotel.audit_logs enable row level security;
alter table hotel.shift_notes enable row level security;
alter table hotel.housekeeping_tasks enable row level security;
alter table hotel.folio_transactions enable row level security;

alter table hotel.room_unit_flags force row level security;
alter table hotel.notifications force row level security;
alter table hotel.audit_logs force row level security;
alter table hotel.shift_notes force row level security;
alter table hotel.housekeeping_tasks force row level security;
alter table hotel.folio_transactions force row level security;

drop policy if exists room_unit_flags_service_role_all on hotel.room_unit_flags;
create policy room_unit_flags_service_role_all on hotel.room_unit_flags for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists room_unit_flags_select_member on hotel.room_unit_flags;
create policy room_unit_flags_select_member on hotel.room_unit_flags for select to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = room_unit_flags.tenant_id and m.user_id = auth.uid()));

drop policy if exists notifications_service_role_all on hotel.notifications;
create policy notifications_service_role_all on hotel.notifications for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists notifications_select_member on hotel.notifications;
create policy notifications_select_member on hotel.notifications for select to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = notifications.tenant_id and m.user_id = auth.uid()));

drop policy if exists notifications_update_member on hotel.notifications;
create policy notifications_update_member on hotel.notifications for update to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = notifications.tenant_id and m.user_id = auth.uid()));

drop policy if exists audit_logs_service_role_all on hotel.audit_logs;
create policy audit_logs_service_role_all on hotel.audit_logs for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists audit_logs_select_member on hotel.audit_logs;
create policy audit_logs_select_member on hotel.audit_logs for select to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = audit_logs.tenant_id and m.user_id = auth.uid()));

drop policy if exists shift_notes_service_role_all on hotel.shift_notes;
create policy shift_notes_service_role_all on hotel.shift_notes for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists shift_notes_select_member on hotel.shift_notes;
create policy shift_notes_select_member on hotel.shift_notes for select to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = shift_notes.tenant_id and m.user_id = auth.uid()));

drop policy if exists hk_tasks_service_role_all on hotel.housekeeping_tasks;
create policy hk_tasks_service_role_all on hotel.housekeeping_tasks for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists hk_tasks_select_member on hotel.housekeeping_tasks;
create policy hk_tasks_select_member on hotel.housekeeping_tasks for select to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = housekeeping_tasks.tenant_id and m.user_id = auth.uid()));

drop policy if exists folio_tx_service_role_all on hotel.folio_transactions;
create policy folio_tx_service_role_all on hotel.folio_transactions for all to public
using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

drop policy if exists folio_tx_select_member on hotel.folio_transactions;
create policy folio_tx_select_member on hotel.folio_transactions for select to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = folio_transactions.tenant_id and m.user_id = auth.uid()));

-- Supabase Realtime (front desk auto-refresh)
do $$
begin
  alter publication supabase_realtime add table hotel.room_units;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table hotel.reservations;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table hotel.notifications;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table hotel.shift_notes;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table hotel.audit_logs;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table hotel.housekeeping_tasks;
exception when duplicate_object then null;
end $$;
