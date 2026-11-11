"use client";

import { useEffect, useState } from "react";
import PhoneInput from "react-phone-number-input";
import type { Value as PhoneInputValue } from "react-phone-number-input";
import { CheckInFieldInfo, CheckInFieldLabelRow } from "@/components/hms/frontdesk/CheckInFieldInfo";
import { FrontDeskPopoverSelect } from "@/components/hms/frontdesk/FrontDeskPopoverSelect";
import { Input } from "@/components/ui/input";
import type { DiscountScope } from "@/lib/hms/walk-in-pricing";

type SettlementMethod = "cash" | "card" | "pos" | "split" | "direct_bill" | "partial_credit";

/**
 * How the guest will settle. The HMS only records payments taken at the desk (cash or the card
 * machine); it never charges a card itself. A company can be billed instead.
 */
export const SETTLEMENT_OPTIONS: { value: SettlementMethod; label: string; help: string }[] = [
  {
    value: "cash",
    label: "Cash",
    help: "The guest pays cash at the desk. Record each payment on their bill when you take it.",
  },
  {
    value: "pos",
    label: "Card machine (POS)",
    help: "The guest pays on your card machine at the desk. Record the payment on their bill once the receipt prints.",
  },
  {
    value: "direct_bill",
    label: "Bill a company",
    help: "A company pays all or part of the stay. Add the company under Who pays on the guest's bill so its part is billed to their account at check-out.",
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
  slug,
  discountPercentInput,
  setDiscountPercentInput,
  discountScope,
  setDiscountScope,
  appliedCode,
  setAppliedCode,
  managerPin,
  setManagerPin,
}: {
  slug: string;
  /** The promo code that filled the discount; empty when the discount is typed by hand. */
  appliedCode: string;
  setAppliedCode: (code: string) => void;
  managerPin: string;
  setManagerPin: (pin: string) => void;
  discountPercentInput: string;
  setDiscountPercentInput: (updater: string | ((prev: string) => string)) => void;
  discountScope: DiscountScope;
  setDiscountScope: (v: DiscountScope) => void;
}) {
  const [codeInput, setCodeInput] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeNote, setCodeNote] = useState<string | null>(null);
  const [policy, setPolicy] = useState<{ threshold: number; canApprove: boolean } | null>(null);

  // The hotel's limit for a discount typed by hand. Above it, a manager must approve.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotel/discount-packages/check?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { threshold?: number; canApprove?: boolean } | null) => {
        if (!cancelled && d && typeof d.threshold === "number") setPolicy({ threshold: d.threshold, canApprove: Boolean(d.canApprove) });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const typedPercent = Number.parseFloat(discountPercentInput.replace(",", ".")) || 0;
  const needsApproval = !appliedCode && policy != null && discountScope !== "none" && typedPercent > policy.threshold;

  const applyCode = async () => {
    setCodeError(null);
    setCodeNote(null);
    if (!codeInput.trim()) {
      setCodeError("Enter a discount code.");
      return;
    }
    setCodeBusy(true);
    try {
      const res = await fetch("/api/hotel/discount-packages/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, code: codeInput.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string; percent?: number; scope?: DiscountScope; name?: string | null };
      if (!res.ok || !data.code || data.percent == null || !data.scope) {
        setCodeError(data.error ?? "That code couldn't be checked. Try again.");
        return;
      }
      setAppliedCode(data.code);
      setDiscountPercentInput(String(data.percent));
      setDiscountScope(data.scope);
      setManagerPin("");
      const scopeLabel = DISCOUNT_SCOPES.find((s) => s.value === data.scope)?.label.toLowerCase() ?? "";
      setCodeNote(`${data.code}${data.name ? ` (${data.name})` : ""}: ${data.percent}% off, ${scopeLabel}.`);
    } finally {
      setCodeBusy(false);
    }
  };

  const removeCode = () => {
    setAppliedCode("");
    setCodeInput("");
    setCodeNote(null);
    setCodeError(null);
    setDiscountPercentInput("");
    setDiscountScope("none");
  };

  return (
    <fieldset className="space-y-4">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <span>Discount</span>
        <CheckInFieldInfo
          label="Discount"
          text="Percentage off the nightly room BAR before taxes. Scope controls which nights receive the discount (all, first, last, or first and last night)."
        />
      </legend>
      <div className="space-y-2">
        <CheckInFieldLabelRow
          htmlFor="discountCode"
          helpTitle="Discount code"
          helpText="A promo code your hotel created in Settings. A valid code fills in the discount and the nights for you. An expired or unknown code shows an error and nothing is changed."
        >
          Discount code (optional)
        </CheckInFieldLabelRow>
        <div className="flex flex-wrap gap-2">
          <Input
            id="discountCode"
            value={appliedCode || codeInput}
            disabled={Boolean(appliedCode)}
            onChange={(e) => {
              setCodeInput(e.target.value.toUpperCase());
              setCodeError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void applyCode();
              }
            }}
            placeholder="For example SUMMER15"
            autoComplete="off"
            className="h-10 max-w-xs rounded-xl uppercase"
          />
          {appliedCode ? (
            <button type="button" onClick={removeCode} className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50">
              Remove code
            </button>
          ) : (
            <button
              type="button"
              disabled={codeBusy}
              onClick={() => void applyCode()}
              className="h-10 rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60"
            >
              {codeBusy ? "Checking…" : "Apply code"}
            </button>
          )}
        </div>
        {codeError ? <p role="alert" className="text-xs font-medium text-rose-600">{codeError}</p> : null}
        {codeNote ? <p role="status" className="text-xs font-medium text-emerald-700">{codeNote}</p> : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            disabled={Boolean(appliedCode)}
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
            disabled={Boolean(appliedCode)}
            onChange={(v) => setDiscountScope(v as DiscountScope)}
            placeholder="Select discount scope…"
            options={DISCOUNT_SCOPES.map((o) => ({ value: o.value, label: o.label }))}
          />
        </div>
        {needsApproval ? (
          <div className="space-y-2 sm:col-span-2">
            <CheckInFieldLabelRow
              htmlFor="discountManagerPin"
              helpTitle="Manager approval"
              helpText={`Your hotel needs a manager's approval for a typed discount above ${policy?.threshold}%. An owner or admin who is signed in does not need the PIN. Who approved it is recorded on the booking.`}
            >
              Manager approval needed
            </CheckInFieldLabelRow>
            <Input
              id="discountManagerPin"
              type="password"
              autoComplete="off"
              value={managerPin}
              onChange={(e) => setManagerPin(e.target.value)}
              placeholder={policy?.canApprove ? "Not needed: you are an owner or admin" : "Manager PIN"}
              className="h-10 max-w-xs rounded-xl"
            />
            <p className="text-xs text-slate-600">
              Discounts above {policy?.threshold}% need a manager. {policy?.canApprove ? "As an owner or admin your sign-in counts as the approval." : "Enter the manager PIN to continue."}
            </p>
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}

export function SettlementBillingFieldset({
  settlementMethod,
  setSettlementMethod,
  settlementType,
  billToAccount,
  poNumber,
  billToContactName,
  billToContactPhone,
  billToContactEmail,
}: {
  settlementMethod: SettlementMethod;
  setSettlementMethod: (v: SettlementMethod) => void;
  settlementType?: string | null;
  billToAccount?: string | null;
  poNumber?: string | null;
  billToContactName?: string | null;
  billToContactPhone?: string | null;
  billToContactEmail?: string | null;
}) {
  const [billTo, setBillTo] = useState(billToAccount ?? "");
  const [contactPhone, setContactPhone] = useState<PhoneInputValue | undefined>((billToContactPhone as PhoneInputValue | null) ?? undefined);
  // Only relevant when a company pays, so the fields stay hidden for ordinary cash/card stays.
  const showContact = settlementMethod === "direct_bill" || billTo.trim() !== "";
  return (
    <fieldset className="space-y-4">
      <legend className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
        <span>Settlement &amp; billing</span>
        <CheckInFieldInfo
          label="Settlement & billing"
          text="How the guest or a company will settle the bill. Payments are taken at the desk and recorded on the bill; nothing is charged from here."
        />
      </legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        <div className="space-y-2">
          <CheckInFieldLabelRow
            htmlFor="billToAccount"
            helpTitle="Bill to (account / company)"
            helpText="Company or master account name or code when a third party pays all or part of the folio (direct bill settlement)."
          >
            Bill to (account / company)
          </CheckInFieldLabelRow>
          <Input
            id="billToAccount"
            name="billToAccount"
            value={billTo}
            onChange={(e) => setBillTo(e.target.value)}
            className="h-10 rounded-xl"
          />
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
        {showContact ? (
          <>
            <div className="space-y-2">
              <CheckInFieldLabelRow
                htmlFor="billToContactName"
                helpTitle="Billing contact name"
                helpText="The person at the paying company to send the invoice to or call about the bill. Shown on the folio, the invoice and the stay."
              >
                Billing contact name
              </CheckInFieldLabelRow>
              <Input
                id="billToContactName"
                name="billToContactName"
                defaultValue={billToContactName ?? undefined}
                autoComplete="off"
                className="h-10 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <CheckInFieldLabelRow
                htmlFor="billToContactPhone"
                helpTitle="Billing contact phone"
                helpText="Phone of the billing contact, in international format with the country code."
              >
                Billing contact phone
              </CheckInFieldLabelRow>
              <PhoneInput
                id="billToContactPhone"
                international
                defaultCountry="NG"
                value={contactPhone}
                onChange={setContactPhone}
                placeholder="Phone number"
                className="phone-input-wrapper !rounded-xl"
                style={{ ["--PhoneInputCountryFlag-height" as string]: "1.1em" }}
              />
              <input type="hidden" name="billToContactPhone" value={contactPhone ?? ""} />
            </div>
            <div className="space-y-2">
              <CheckInFieldLabelRow
                htmlFor="billToContactEmail"
                helpTitle="Billing contact email"
                helpText="Where the paying company wants its invoice sent. Separate from the guest's own email."
              >
                Billing contact email
              </CheckInFieldLabelRow>
              <Input
                id="billToContactEmail"
                name="billToContactEmail"
                type="email"
                defaultValue={billToContactEmail ?? undefined}
                autoComplete="off"
                className="h-10 rounded-xl"
              />
            </div>
          </>
        ) : null}
      </div>
    </fieldset>
  );
}
