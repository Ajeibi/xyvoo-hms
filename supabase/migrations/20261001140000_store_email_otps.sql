-- One-time codes for confirming a store owner's email after registration.
-- Mirrors hotel.registration_otps, but keyed to the user (the account exists
-- before verification) rather than to a tenant supplied by the browser.

create table if not exists store.email_otps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  otp_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_store_email_otps_user_created
  on store.email_otps (user_id, created_at desc);

alter table store.email_otps enable row level security;
alter table store.email_otps force row level security;

-- Service role only: codes are never readable by the browser.
drop policy if exists store_email_otps_service_role_all on store.email_otps;
create policy store_email_otps_service_role_all on store.email_otps
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
