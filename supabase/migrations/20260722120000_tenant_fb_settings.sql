create table if not exists hotel.tenant_fb_settings (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  kitchen_overdue_minutes int check (kitchen_overdue_minutes between 1 and 120),
  updated_at timestamptz not null default now()
);

comment on table hotel.tenant_fb_settings is 'Per-property F&B operational settings (kitchen timing, etc.)';
comment on column hotel.tenant_fb_settings.kitchen_overdue_minutes is 'Minutes before kitchen tickets turn red / trigger overdue alerts';
