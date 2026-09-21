"use client";

import { CheckInFieldInfo, CheckInFieldLabelRow } from "@/components/hms/frontdesk/CheckInFieldInfo";
import { FrontDeskPopoverSelect } from "@/components/hms/frontdesk/FrontDeskPopoverSelect";
import { Input } from "@/components/ui/input";
import type { DiscountScope } from "@/lib/hms/walk-in-pricing";

type SettlementMethod = "cash" | "card" | "pos" | "split" | "direct_bill" | "partial_credit";

export const SETTLEMENT_OPTIONS: { value: SettlementMethod; label: string; help: string }[] = [
  {
    value: "cash",
    label: "Cash",
    help: "Guest settles mainly in cash. Folio balance is typically collected at checkout unless you take deposit upfront.",
  },
  {
    value: "card",
    label: "Credit card",
    help: "Card payments are recorded on the guest folio — post at check-in, during the stay, or at checkout.",
  },
  {
    value: "pos",
    label: "POS (terminal)",
    help: "Guest pays on your bank POS terminal at the desk. Record the payment on the folio after the receipt is in hand — same workflow as cash.",
  },
  {
    value: "partial_credit",
    label: "Partial credit",
    help: "Part of the balance on card or account credit and the remainder by another method (e.g. cash + card).",
  },
  {
    value: "split",
    label: "Split tender",
    help: "Multiple payment methods or legs on one folio (e.g. guest pays room, company pays incidentals per your split rules).",
  },
  {
    value: "direct_bill",
    label: "Direct bill / company",
    help: "Charges post to a company master account or AR ledger; guest may still have incidentals on guest leg.",
  },
];

export const DISCOUNT_SCOPES: { value: DiscountScope; label: string }[] = [
  { value: "none", label: "No discount" },
  { value: "all_nights", label: "All nights" },
  { value: "first_night", label: "First night only" },
  { value: "last_night", label: "Last night only" },
  { value: "first_and_last", label: "First and last night" },
];

/** Extracted verbatim from FrontDeskCheckInForm.tsx (P2 refactor — no behavior change). */
export function DiscountFieldset({
  discountPercentInput,
  setDiscountPercentInput,
  discountScope,
  setDiscountScope,
}: {
  discountPercentInput: string;
  setDiscountPercentInput: (updater: string | ((prev: string) => string)) => void;
  discountScope: DiscountScope;
  setDiscountScope: (v: DiscountScope) => void;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <span>Discount</span>
        <CheckInFieldInfo
          label="Discount"
          text="Percentage off the nightly room BAR before taxes. Scope controls which nights receive the discount (all, first, last, or first and last night)."
        />
      </legend>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="discountPercent"
            helpTitle="Discount (%)"
            helpText="Promotional or negotiated percentage reduction on qualifying room nights (see Apply discount to). Applied before service charge and taxes in the estimate."
          >
            Discount (%)
          </CheckInFieldLabelRow>
          <Input
            id="discountPercent"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0"
            value={discountPercentInput}
            onChange={(e) => {
              let next = e.target.value.replace(",", ".");
              if (next === "") {
                setDiscountPercentInput("");
                return;
              }
              if (!/^\d{0,3}(\.\d{0,2})?$/.test(next)) return;
              if (/^0+[1-9]/.test(next)) {
                next = next.replace(/^0+/, "");
              }
              setDiscountPercentInput(next);
            }}
            onBlur={() => {
              setDiscountPercentInput((prev) => {
                const t = prev.trim().replace(",", ".");
                if (t === "" || t === ".") return "";
                const n = Math.min(100, Math.max(0, Number.parseFloat(t.endsWith(".") ? t.slice(0, -1) : t) || 0));
                if (Number.isInteger(n)) return String(n);
                return String(n);
              });
            }}
            className="h-10 rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="discountScope"
            helpTitle="Apply discount to"
            helpText="Which nights get the percentage: none, every night, only the first night, only the last night, or both first and last. Updates the rate summary immediately."
          >
            Apply discount to
          </CheckInFieldLabelRow>
          <FrontDeskPopoverSelect
            id="discountScope"
            value={discountScope}
            onChange={(v) => setDiscountScope(v as DiscountScope)}
            placeholder="Select discount scope…"
            options={DISCOUNT_SCOPES.map((o) => ({ value: o.value, label: o.label }))}
          />
        </div>
      </div>
    </fieldset>
  );
}

export function SettlementBillingFieldset({
  settlementMethod,
  setSettlementMethod,
  showPreauthField,
  currency,
  settlementType,
  preauthAmount,
  cardLast4,
  cardExpiry,
  billToAccount,
  poNumber,
}: {
  settlementMethod: SettlementMethod;
  setSettlementMethod: (v: SettlementMethod) => void;
  showPreauthField: boolean;
  currency: string;
  settlementType?: string | null;
  preauthAmount?: number | null;
  cardLast4?: string | null;
  cardExpiry?: string | null;
  billToAccount?: string | null;
  poNumber?: string | null;
}) {
  return (
    <fieldset className="space-y-4">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <span>Settlement &amp; billing</span>
        <CheckInFieldInfo
          label="Settlement & billing"
          text="How the guest or company will pay or guarantee the folio. Pick one primary method; optional fields below capture card hints, pre-auth, and bill-to details."
        />
      </legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {SETTLEMENT_OPTIONS.map((opt) => (
          <div
            key={opt.value}
            className={`flex items-center justify-between gap-1 rounded-xl border px-2 py-1.5 text-sm sm:px-3 sm:py-2 ${
              settlementMethod === opt.value
                ? "border-blue-400 bg-blue-50/80 text-blue-900"
                : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 px-1 py-0.5">
              <input
                type="radio"
                name="settlementMethodUi"
                className="border-slate-300"
                checked={settlementMethod === opt.value}
                onChange={() => setSettlementMethod(opt.value)}
              />
              {opt.label}
            </label>
            <CheckInFieldInfo label={opt.label} text={opt.help} />
          </div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="settlementType"
            helpTitle="Settlement type / ledger note"
            helpText="Free-text note for finance (e.g. corporate master, travel agent ledger, city ledger). Clarifies how charges should be routed in back office."
          >
            Settlement type / ledger note
          </CheckInFieldLabelRow>
          <Input
            id="settlementType"
            name="settlementType"
            placeholder="e.g. Guest account, corporate master…"
            defaultValue={settlementType ?? undefined}
            className="h-10 rounded-xl"
          />
        </div>
        {showPreauthField ? (
          <div className="space-y-2">
            <CheckInFieldLabelRow
              htmlFor="preauthAmount"
              helpTitle="Deposit / authorization amount"
              helpText="Optional hold amount for card stays. Post the deposit or full balance on the folio after check-in when ready."
            >
              Deposit / auth amount ({currency})
            </CheckInFieldLabelRow>
            <Input
              id="preauthAmount"
              name="preauthAmount"
              type="number"
              min={0}
              step="0.01"
              defaultValue={preauthAmount ?? undefined}
              className="h-10 rounded-xl"
              placeholder="Optional"
            />
          </div>
        ) : null}
        {settlementMethod === "partial_credit" ? (
          <>
            <div className="space-y-2">
              <CheckInFieldLabelRow
                htmlFor="cardLast4"
                helpTitle="Card last 4 digits"
                helpText="Last four digits only — for staff reference on the folio. Never store full PAN in plain text; use your PCI-compliant capture flow for full numbers."
              >
                Card last 4 digits
              </CheckInFieldLabelRow>
              <Input id="cardLast4" name="cardLast4" maxLength={4} defaultValue={cardLast4 ?? undefined} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-2">
              <CheckInFieldLabelRow
                htmlFor="cardExpiry"
                helpTitle="Card expiry (MM/YY)"
                helpText="Expiry as shown on the card. Helps match receipts and chargebacks; still not full card data."
              >
                Card expiry (MM/YY)
              </CheckInFieldLabelRow>
              <Input id="cardExpiry" name="cardExpiry" placeholder="MM/YY" defaultValue={cardExpiry ?? undefined} className="h-10 rounded-xl" />
            </div>
          </>
        ) : null}
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="billToAccount"
            helpTitle="Bill to (account / company)"
            helpText="Company or master account name or code when a third party pays all or part of the folio (direct bill settlement)."
          >
            Bill to (account / company)
          </CheckInFieldLabelRow>
          <Input id="billToAccount" name="billToAccount" defaultValue={billToAccount ?? undefined} className="h-10 rounded-xl" />
        </div>
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="poNumber"
            helpTitle="PO number"
            helpText="Purchase order or cost-centre reference from the guest or company so AR can match the invoice."
          >
            PO number
          </CheckInFieldLabelRow>
          <Input id="poNumber" name="poNumber" defaultValue={poNumber ?? undefined} className="h-10 rounded-xl" />
        </div>
      </div>
    </fieldset>
  );
}
