-- Walk-in check-in: POS / partial credit settlement; audit snapshot for taxes & discounts.

alter table hotel.reservations drop constraint if exists reservations_settlement_method_check;

alter table hotel.reservations
  add constraint reservations_settlement_method_check
  check (
    settlement_method in (
      'cash',
      'card',
      'pos',
      'split',
      'direct_bill',
      'partial_credit'
    )
  );

comment on column hotel.reservations.settlement_method is
  'cash | card (credit card) | pos (terminal) | split | direct_bill (company) | partial_credit';

alter table hotel.reservations
  add column if not exists pricing_snapshot jsonb not null default '{}'::jsonb;

comment on column hotel.reservations.pricing_snapshot is
  'Walk-in / front desk pricing audit: discounts, Nigeria VAT & levies, exemptions, folio line breakdown.';

alter table hotel.reservations
  add column if not exists remarks_by_phase jsonb not null default '{}'::jsonb;

comment on column hotel.reservations.remarks_by_phase is
  'Optional { "reservation": string, "check_in": string, "check_out": string } guest-facing notes.';

alter table hotel.reservations
  add column if not exists guarantee_release_date date;

comment on column hotel.reservations.guarantee_release_date is
  'Date guarantee or hold may release if not settled (policy-dependent).';
