-- Guest services workbench: extend guest_requests + notes + events timeline

-- 1) New columns on guest_requests
alter table hotel.guest_requests
  add column if not exists room_unit_id uuid references hotel.room_units(id) on delete set null;

alter table hotel.guest_requests
  add column if not exists service_category text not null default 'special';

alter table hotel.guest_requests
  add column if not exists details text;

alter table hotel.guest_requests
  add column if not exists priority text not null default 'normal';

alter table hotel.guest_requests
  add column if not exists assigned_user_id uuid;

alter table hotel.guest_requests
  add column if not exists assigned_at timestamptz;

alter table hotel.guest_requests
  add column if not exists expected_completed_at timestamptz;

alter table hotel.guest_requests
  add column if not exists completed_at timestamptz;

alter table hotel.guest_requests
  add column if not exists billable boolean not null default false;

alter table hotel.guest_requests
  add column if not exists service_amount numeric(14,2);

alter table hotel.guest_requests
  add column if not exists folio_line_id uuid;

alter table hotel.guest_requests
  add column if not exists is_vip_snapshot boolean not null default false;

alter table hotel.guest_requests
  add column if not exists updated_at timestamptz not null default now();

-- 2) Migrate legacy status values before replacing check constraint
alter table hotel.guest_requests drop constraint if exists guest_requests_status_check;

update hotel.guest_requests set status = 'pending' where status = 'open';
update hotel.guest_requests set status = 'completed' where status = 'fulfilled';

alter table hotel.guest_requests
  add constraint guest_requests_status_check
  check (status in ('pending', 'assigned', 'in_progress', 'waiting', 'completed', 'cancelled', 'escalated'));

alter table hotel.guest_requests
  add constraint guest_requests_priority_check
  check (priority in ('low', 'normal', 'high', 'urgent', 'vip'));

alter table hotel.guest_requests
  add constraint guest_requests_service_category_check
  check (service_category in (
    'housekeeping', 'laundry', 'food_beverage', 'concierge',
    'maintenance', 'security', 'special', 'other'
  ));

alter table hotel.guest_requests alter column status set default 'pending';

-- Copy fulfilled_at into completed_at then drop legacy column
update hotel.guest_requests
set completed_at = coalesce(completed_at, fulfilled_at)
where fulfilled_at is not null;

alter table hotel.guest_requests drop column if exists fulfilled_at;

create index if not exists idx_guest_requests_tenant_status
  on hotel.guest_requests (tenant_id, status, created_at desc);

create index if not exists idx_guest_requests_tenant_dept
  on hotel.guest_requests (tenant_id, department, status);

create index if not exists idx_guest_requests_expected
  on hotel.guest_requests (tenant_id, expected_completed_at)
  where status not in ('completed', 'cancelled');

-- 3) Internal notes
create table if not exists hotel.guest_request_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  guest_request_id uuid not null references hotel.guest_requests(id) on delete cascade,
  body text not null,
  visibility text not null default 'front_desk'
    check (visibility in ('front_desk', 'department', 'manager')),
  author_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_guest_request_notes_request
  on hotel.guest_request_notes (guest_request_id, created_at desc);

alter table hotel.guest_request_notes enable row level security;
alter table hotel.guest_request_notes force row level security;

drop policy if exists guest_request_notes_service_role_all on hotel.guest_request_notes;
create policy guest_request_notes_service_role_all on hotel.guest_request_notes for all to public
using (true) with check (true);

drop policy if exists guest_request_notes_select_member on hotel.guest_request_notes;
create policy guest_request_notes_select_member on hotel.guest_request_notes for select to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = guest_request_notes.tenant_id and m.user_id = auth.uid()));

drop policy if exists guest_request_notes_insert_member on hotel.guest_request_notes;
create policy guest_request_notes_insert_member on hotel.guest_request_notes for insert to authenticated
with check (exists (select 1 from hotel.memberships m where m.tenant_id = guest_request_notes.tenant_id and m.user_id = auth.uid()));

-- 4) Activity timeline (append-only events)
create table if not exists hotel.guest_request_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  guest_request_id uuid not null references hotel.guest_requests(id) on delete cascade,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_user_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_guest_request_events_request
  on hotel.guest_request_events (guest_request_id, created_at asc);

alter table hotel.guest_request_events enable row level security;
alter table hotel.guest_request_events force row level security;

drop policy if exists guest_request_events_service_role_all on hotel.guest_request_events;
create policy guest_request_events_service_role_all on hotel.guest_request_events for all to public
using (true) with check (true);

drop policy if exists guest_request_events_select_member on hotel.guest_request_events;
create policy guest_request_events_select_member on hotel.guest_request_events for select to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = guest_request_events.tenant_id and m.user_id = auth.uid()));

drop policy if exists guest_request_events_insert_member on hotel.guest_request_events;
create policy guest_request_events_insert_member on hotel.guest_request_events for insert to authenticated
with check (exists (select 1 from hotel.memberships m where m.tenant_id = guest_request_events.tenant_id and m.user_id = auth.uid()));

-- 5) guest_requests: allow authenticated insert/update (was service_role only for all)
drop policy if exists guest_requests_insert_member on hotel.guest_requests;
create policy guest_requests_insert_member on hotel.guest_requests for insert to authenticated
with check (exists (select 1 from hotel.memberships m where m.tenant_id = guest_requests.tenant_id and m.user_id = auth.uid()));

drop policy if exists guest_requests_update_member on hotel.guest_requests;
create policy guest_requests_update_member on hotel.guest_requests for update to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = guest_requests.tenant_id and m.user_id = auth.uid()))
with check (exists (select 1 from hotel.memberships m where m.tenant_id = guest_requests.tenant_id and m.user_id = auth.uid()));
