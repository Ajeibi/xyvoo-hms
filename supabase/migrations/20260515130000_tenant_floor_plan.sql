alter table if exists public.tenants
  add column if not exists floor_plan jsonb not null default '[]'::jsonb;

comment on column public.tenants.floor_plan is 'Physical layout: [{ "floor": number, "room_count": number }, ...]. Sum of room_count should match hotel.profiles.room_count.';
