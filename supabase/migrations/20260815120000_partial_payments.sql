-- Vendor bills and customer invoices could each only be settled in one full-amount payment —
-- `unique(vendor_bill_id)` / `unique(customer_invoice_id)` meant a second payment against the
-- same bill/invoice was rejected outright, with no way to record a partial payment at all.
-- createPaymentRun / recordCustomerInvoicePayment now sum every payment line against a bill or
-- invoice to compute what's actually left owing, so more than one row per bill/invoice is the
-- expected shape going forward, not an error case.

alter table hotel.vendor_bill_payment_lines drop constraint if exists vendor_bill_payment_lines_vendor_bill_id_key;
alter table hotel.customer_invoice_payment_lines drop constraint if exists customer_invoice_payment_lines_customer_invoice_id_key;

comment on table hotel.vendor_bill_payment_lines is
  'One row per payment applied to a bill — a bill can now be paid across more than one row (partial payments).';
comment on table hotel.customer_invoice_payment_lines is
  'One row per payment received against an invoice — an invoice can now be paid across more than one row (partial payments).';
