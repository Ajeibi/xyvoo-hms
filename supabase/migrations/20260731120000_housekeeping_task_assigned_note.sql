-- Free-text "who's on this" label for a housekeeping task, set manually by whoever is
-- looking at the task list — distinct from assigned_staff_id (a real login FK), since the
-- Housekeeping department currently only ever has a single login account and staff are
-- divided up outside the system rather than via individual per-attendant accounts.
alter table hotel.housekeeping_tasks
  add column if not exists assigned_note text;
