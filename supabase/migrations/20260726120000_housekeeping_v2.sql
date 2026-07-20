-- Housekeeping module rework: real task history (one open task per room instead of
-- one row per room forever), task types, inspection sign-off, tenant settings, lost & found.

alter table hotel.housekeeping_tasks drop constraint if exists housekeeping_tasks_room_unit_id_key;

alter table hotel.housekeeping_tasks
  add column if not exists task_type text not null default 'checkout_clean'
    check (task_type in ('checkout_clean', 'stayover', 'deep_clean', 'turndown', 'reinspection'));

alter table hotel.housekeeping_tasks
  add column if not exists reservation_id uuid references hotel.reservations(id) on delete set null;

alter table hotel.housekeeping_tasks
  add column if not exists inspected_by uuid;

alter table hotel.housekeeping_tasks
  add column if not exists inspection_result text
    check (inspection_result is null or inspection_result in ('pass', 'fail'));

-- At most one OPEN task per room at a time. Replaces the old permanent
-- unique(room_unit_id), which silently overwrote a room's cleaning history.
create unique index if not exists uniq_hk_open_task_per_room
  on hotel.housekeeping_tasks (room_unit_id)
  where status <> 'ready';

create index if not exists idx_hk_tasks_tenant_status on hotel.housekeeping_tasks (tenant_id, status);
create index if not exists idx_hk_tasks_assigned on hotel.housekeeping_tasks (tenant_id, assigned_staff_id) where assigned_staff_id is not null;

comment on column hotel.housekeeping_tasks.task_type is 'checkout_clean | stayover | deep_clean | turndown | reinspection';
comment on column hotel.housekeeping_tasks.reservation_id is 'Reservation this cleaning cycle relates to, when known — join point for guest-request lookups.';
comment on column hotel.housekeeping_tasks.inspected_by is 'auth user id of the inspector — must differ from assigned_staff_id unless self-inspection is enabled in settings.';
comment on column hotel.housekeeping_tasks.inspection_result is 'pass | fail — a fail reopens a reinspection task rather than resetting status silently.';

create table if not exists hotel.tenant_housekeeping_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  sla_checkout_minutes int not null default 30 check (sla_checkout_minutes between 1 and 480),
  sla_stayover_minutes int not null default 20 check (sla_stayover_minutes between 1 and 480),
  sla_deep_clean_minutes int not null default 90 check (sla_deep_clean_minutes between 1 and 480),
  sla_turndown_minutes int not null default 20 check (sla_turndown_minutes between 1 and 480),
  inspection_policy text not null default 'all' check (inspection_policy in ('all', 'spot_check', 'self')),
  spot_check_percent int not null default 20 check (spot_check_percent between 1 and 100),
  self_inspection_allowed boolean not null default false,
  priority_escalation_minutes int not null default 15 check (priority_escalation_minutes between 1 and 240),
  stayover_cadence_days int not null default 1 check (stayover_cadence_days between 1 and 7),
  updated_at timestamptz not null default now()
);

comment on table hotel.tenant_housekeeping_settings is 'Per-property Housekeeping operational settings (SLA targets, inspection policy, escalation window).';

create table if not exists hotel.lost_found_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_unit_id uuid references hotel.room_units(id) on delete set null,
  reservation_id uuid references hotel.reservations(id) on delete set null,
  description text not null,
  photo_url text,
  status text not null default 'logged' check (status in ('logged', 'guest_notified', 'returned', 'disposed')),
  found_by uuid not null,
  found_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_lost_found_items_tenant on hotel.lost_found_items (tenant_id, status);

-- RLS for the new event-log-style table (mirrors the inventory/procurement pattern).
-- tenant_housekeeping_settings intentionally has no RLS, matching tenant_fb_settings —
-- it is only ever read/written through the service-role client from server code.
do $$
declare
  t text;
begin
  foreach t in array array['lost_found_items']
  loop
    execute format('alter table hotel.%I enable row level security', t);
    execute format('alter table hotel.%I force row level security', t);

    execute format('drop policy if exists %I_service_role_all on hotel.%I', t, t);
    execute format(
      'create policy %I_service_role_all on hotel.%I for all to public using (true) with check (true)',
      t, t
    );
    execute format('drop policy if exists %I_select_member on hotel.%I', t, t);
    execute format(
      'create policy %I_select_member on hotel.%I for select to authenticated
       using (exists (select 1 from hotel.memberships m where m.tenant_id = %I.tenant_id and m.user_id = auth.uid()))',
      t, t, t
    );
    execute format('drop policy if exists %I_insert_member on hotel.%I', t, t);
    execute format(
      'create policy %I_insert_member on hotel.%I for insert to authenticated
       with check (exists (select 1 from hotel.memberships m where m.tenant_id = %I.tenant_id and m.user_id = auth.uid()))',
      t, t, t
    );
    execute format('drop policy if exists %I_update_member on hotel.%I', t, t);
    execute format(
      'create policy %I_update_member on hotel.%I for update to authenticated
       using (exists (select 1 from hotel.memberships m where m.tenant_id = %I.tenant_id and m.user_id = auth.uid()))',
      t, t, t
    );
    execute format('drop policy if exists %I_delete_member on hotel.%I', t, t);
    execute format(
      'create policy %I_delete_member on hotel.%I for delete to authenticated
       using (exists (select 1 from hotel.memberships m where m.tenant_id = %I.tenant_id and m.user_id = auth.uid()))',
      t, t, t
    );
  end loop;
end $$;
