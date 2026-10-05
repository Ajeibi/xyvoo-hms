-- Special requests logged at arrival had no explicit "verbally confirmed with guest" step —
-- the PRD calls for one distinct from the request simply existing or being fulfilled.

alter table hotel.guest_requests add column if not exists confirmed_at timestamptz;

comment on column hotel.guest_requests.confirmed_at is
  'When staff verbally confirmed this request with the guest — separate from created_at (logged) and completed_at (fulfilled).';
