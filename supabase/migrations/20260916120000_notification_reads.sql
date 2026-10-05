-- notifications.read_at was a single tenant-wide column, so "mark all read" (and the unread
-- badge count) was shared across every viewer — one staff member reading a notification marked
-- it read for everyone else too. Per-user read state now lives in its own join table instead;
-- notifications.read_at is left in place but unused going forward (not worth a destructive drop).

create table if not exists hotel.notification_reads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  notification_id uuid not null references hotel.notifications(id) on delete cascade,
  user_id uuid not null,
  read_at timestamptz not null default now(),
  unique (notification_id, user_id)
);

create index if not exists idx_notification_reads_user on hotel.notification_reads (tenant_id, user_id);

comment on table hotel.notification_reads is
  'Per-user read state for hotel.notifications — replaces the shared notifications.read_at column, which stays but is no longer written to.';

alter table hotel.notification_reads enable row level security;
alter table hotel.notification_reads force row level security;

drop policy if exists notification_reads_service_role_all on hotel.notification_reads;
create policy notification_reads_service_role_all
on hotel.notification_reads
for all to public
using (true)
with check (true);

drop policy if exists notification_reads_select_member on hotel.notification_reads;
create policy notification_reads_select_member
on hotel.notification_reads
for select to authenticated
using (exists (select 1 from hotel.memberships m where m.tenant_id = notification_reads.tenant_id and m.user_id = auth.uid()));

drop policy if exists notification_reads_insert_member on hotel.notification_reads;
create policy notification_reads_insert_member
on hotel.notification_reads
for insert to authenticated
with check (exists (select 1 from hotel.memberships m where m.tenant_id = notification_reads.tenant_id and m.user_id = auth.uid()));
