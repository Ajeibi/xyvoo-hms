-- Escalating a complaint/incident should route to a department (matching the tenant's own
-- configured Guest Service Categories departments), not a single named staff member who may
-- not even be on shift.

alter table hotel.guest_incidents add column if not exists escalated_to_department text;

alter table hotel.guest_incidents drop column if exists escalated_to_user_id;

comment on column hotel.guest_incidents.escalated_to_department is
  'Department slug this case was escalated to (matches hotel.guest_service_categories.department for the tenant), e.g. housekeeping, maintenance, front_desk.';
