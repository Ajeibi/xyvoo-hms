-- When true, the HMS dashboard onboarding tour is suppressed for every user on this tenant
-- (set when someone chooses "Never show again" on the tour).
alter table if exists public.tenants
  add column if not exists hms_dashboard_tour_hidden boolean not null default false;

comment on column public.tenants.hms_dashboard_tour_hidden is
  'HMS dashboard driver.js tour hidden for all users of this hotel after "Never show again".';
