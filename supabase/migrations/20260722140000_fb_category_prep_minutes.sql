-- Per-category cook-time target used to colour the kitchen timing (green -> amber -> red).
-- NULL means the category has no override and falls back to the global kitchen threshold
-- (tenant_fb_settings.kitchen_overdue_minutes).
alter table hotel.fb_menu_categories
  add column if not exists prep_minutes int
    check (prep_minutes is null or (prep_minutes >= 1 and prep_minutes <= 240));

comment on column hotel.fb_menu_categories.prep_minutes is
  'Per-category cook-time target in minutes. NULL falls back to tenant_fb_settings.kitchen_overdue_minutes.';
