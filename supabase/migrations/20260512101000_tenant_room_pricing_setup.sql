alter table if exists public.tenants
  add column if not exists room_types jsonb not null default '[]'::jsonb,
  add column if not exists pricing_setup jsonb not null default '{}'::jsonb;
