-- Customer invoices captured a `currency` at creation but never a conversion rate, so a
-- foreign-currency invoice's raw total posted straight to the (single-currency) ledger with
-- no conversion — the same bug fixed on hotel.vendor_bills, which already has fx_rate. This
-- brings customer_invoices to parity: the rate agreed at invoice time is captured once, here,
-- and applied when posting to the ledger (see createCustomerInvoice in customer-invoices.ts).

alter table hotel.customer_invoices
  add column if not exists fx_rate numeric(14, 6) not null default 1;

comment on column hotel.customer_invoices.fx_rate is
  '1 unit of `currency` expressed in the tenant''s base ledger currency, captured at invoice time — mirrors hotel.vendor_bills.fx_rate.';
