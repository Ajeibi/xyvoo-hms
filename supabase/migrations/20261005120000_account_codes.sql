-- One-time codes emailed to account holders: confirming a new store owner's
-- email address, and resetting a forgotten password (any product). Codes are
-- stored hashed, expire after a few minutes and allow a handful of attempts.
--
-- Replaces store.email_otps (20261001140000), which was never used: password
-- reset covers hotel staff as well, so the table belongs outside the store schema.

create table if not exists public.account_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('verify_email', 'reset_password')),
  code_hash text not null,
  expires_at timestamptz not null,
  attempts int not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_account_codes_user_purpose_created
  on public.account_codes (user_id, purpose, created_at desc);

alter table public.account_codes enable row level security;
alter table public.account_codes force row level security;

-- Service role only: codes are never readable from the browser.
drop policy if exists account_codes_service_role_all on public.account_codes;
create policy account_codes_service_role_all on public.account_codes
for all to public using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

revoke all on public.account_codes from anon, authenticated;

-- Looks an account up by email for the code endpoints. auth.users isn't exposed
-- through the API, so this runs with definer rights and only the service role may call it.
create or replace function public.find_auth_user_by_email(p_email text)
returns table (id uuid, email text, email_confirmed_at timestamptz, full_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text, u.email_confirmed_at, (u.raw_user_meta_data ->> 'full_name')
  from auth.users u
  where lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

revoke execute on function public.find_auth_user_by_email(text) from public, anon, authenticated;
grant execute on function public.find_auth_user_by_email(text) to service_role;

drop table if exists store.email_otps;
