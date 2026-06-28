alter table hotel.profiles
  add column if not exists dashboard_tour_status text not null default 'pending';

alter table hotel.profiles
  drop constraint if exists profiles_dashboard_tour_status_check;

alter table hotel.profiles
  add constraint profiles_dashboard_tour_status_check
  check (dashboard_tour_status in ('pending', 'skipped', 'completed'));
