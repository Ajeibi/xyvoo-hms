-- Financial statements (P&L, Balance Sheet, Cash Flow) are being added on top of the existing
-- ledger. The Cash Flow Statement needs to know which accounts represent actual cash (to compute
-- beginning/ending cash) and which bucket (operating/investing/financing) every other account's
-- balance change belongs in — neither concept existed on chart_of_accounts before.

alter table hotel.chart_of_accounts
  add column if not exists is_cash_equivalent boolean not null default false,
  add column if not exists cash_flow_category text not null default 'operating'
    check (cash_flow_category in ('operating', 'investing', 'financing'));

comment on column hotel.chart_of_accounts.is_cash_equivalent is
  'Marks a bank/cash account for Cash Flow Statement beginning/ending cash totals.';
comment on column hotel.chart_of_accounts.cash_flow_category is
  'Which Cash Flow Statement section this account''s balance change belongs in. Revenue/expense accounts are excluded from the reconciliation entirely (Net Income already captures their movement) regardless of this value.';

-- Backfill the starter chart (seedHospitalityChartOfAccounts) for every tenant that still has
-- these accounts at their original codes. Manually added accounts default to 'operating' /
-- not-cash-equivalent, which is the safe default until a tenant explicitly marks otherwise.
update hotel.chart_of_accounts set is_cash_equivalent = true
  where code in ('1000', '1010', '1020'); -- Cash on Hand, Bank Account, Card & POS Clearing

update hotel.chart_of_accounts set cash_flow_category = 'investing'
  where code = '1500'; -- Fixed Assets (gross purchases/disposals only — not Accumulated Depreciation)
update hotel.chart_of_accounts set cash_flow_category = 'financing'
  where code = '3000'; -- Owner's Equity
-- Accumulated Depreciation (1590) and everything else keep the 'operating' default: depreciation's
-- non-cash add-back belongs in operating, since Depreciation Expense is already inside Net Income.
