"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Check, CheckCircle2, Info, Layers, Loader2 } from "lucide-react";
import { STOREFRONT_PLANS } from "@/constants/pricing";
import { formatShopCurrency } from "@/lib/shop/format";
import { STANDARD_CURRENCY, STANDARD_PRICE } from "@/lib/store/billing";
import { PLAN_FEE_RATES } from "@/lib/store/site/onboarding";
import { planSchema } from "@/lib/store/site/onboarding-steps";
import type { StorePlan } from "@/lib/store/site/onboarding";
import type { StepProps, WizardInitial } from "../OnboardingWizard";
import { describedBy, ErrorBanner, Field, inputClass, StepActions } from "../fields";

const PLAN_IDS: Record<string, StorePlan> = { Free: "free", Standard: "standard", Enterprise: "enterprise" };
const naira = (display: string) => display.replace(/^N(?=\d)/, "₦");
const money = (v: number) => formatShopCurrency(Math.round(v), STANDARD_CURRENCY);

/** Monthly sales at which the Free plan's fees equal the Standard price (₦250,000 at 4% and ₦10,000). */
const BREAK_EVEN = STANDARD_PRICE / PLAN_FEE_RATES.free;
const SLIDER_MAX = 2_000_000;
const SLIDER_STEP = 10_000;

/**
 * What each plan includes, as the dashboard actually offers it (see
 * src/lib/store/features.ts). The pricing table's own lists are written for
 * the marketing site; these match what the merchant gets once they sign up.
 */
const SETUP_FEATURES: Record<StorePlan, string[] | null> = {
  free: null,
  standard: [
    "Everything in Free",
    "0% XYVOO fee on your sales",
    "Staff accounts with their own roles",
    "Activity log: who changed what",
    "Push notifications to your customers",
    "Prices in other currencies",
    "CSV and PDF downloads",
  ],
  enterprise: null,
};

type PaymentState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "checking" }
  | { status: "paid" }
  | { status: "pending" }
  | { status: "failed"; message: string };

export default function PlanStep({ slug, initial, busy, errorField, errorMessage, backHref, onSubmit }: StepProps<WizardInitial["plan"]>) {
  const router = useRouter();
  const [plan, setPlan] = useState<StorePlan>(initial.plan);
  const [enquiry, setEnquiry] = useState({ name: "", phone: "", message: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sales, setSales] = useState(150_000);
  const [payment, setPayment] = useState<PaymentState>(
    initial.billing.paidUp ? { status: "paid" } : initial.billing.reference ? { status: "checking" } : { status: "idle" },
  );
  const paymentMessage = useRef<HTMLDivElement>(null);
  const checked = useRef(false);
  const standardPaid = payment.status === "paid";

  // Back from Paystack: confirm the payment with the server, then stay on this step to continue.
  useEffect(() => {
    const reference = initial.billing.reference;
    if (!reference || initial.billing.paidUp || checked.current) return;
    checked.current = true;
    fetch(`/api/store/billing/verify?slug=${encodeURIComponent(slug)}&reference=${encodeURIComponent(reference)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "We couldn't confirm your payment.");
        if (data.status === "success") {
          setPlan("standard");
          setPayment({ status: "paid" });
        } else if (data.status === "pending") {
          setPayment({ status: "pending" });
        } else {
          setPayment({ status: "failed", message: "The payment wasn't completed, so nothing was charged. You can try again, or start on Free and upgrade later." });
        }
      })
      .catch((e) => setPayment({ status: "failed", message: e instanceof Error ? e.message : "We couldn't confirm your payment." }))
      .finally(() => {
        // Drop the reference from the address, so refreshing doesn't check it again.
        router.replace(`/storefront/${slug}/welcome/plan`, { scroll: false });
        paymentMessage.current?.focus();
      });
  }, [initial.billing.reference, initial.billing.paidUp, slug, router]);

  const startPayment = async () => {
    setPayment({ status: "starting" });
    try {
      const res = await fetch("/api/store/billing/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, returnTo: "setup" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || typeof data.authorizationUrl !== "string") {
        throw new Error(typeof data.error === "string" ? data.error : "We couldn't open the payment page. Please try again.");
      }
      window.location.href = data.authorizationUrl;
    } catch (e) {
      setPayment({ status: "failed", message: e instanceof Error ? e.message : "We couldn't open the payment page. Please try again." });
      paymentMessage.current?.focus();
    }
  };

  /** Standard is paid for here when online payment is available; otherwise the choice is saved and paid for later. */
  const needsPayment = plan === "standard" && initial.billing.available && !standardPaid;

  // What each plan costs at the merchant's expected monthly sales.
  const freeCost = sales * PLAN_FEE_RATES.free;
  const saving = Math.abs(freeCost - STANDARD_PRICE);
  const bestPlan: StorePlan | null = freeCost === STANDARD_PRICE ? null : freeCost < STANDARD_PRICE ? "free" : "standard";

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = planSchema.safeParse(plan === "enterprise" ? { plan, enquiry } : { plan });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[String(issue.path.at(-1))] ??= issue.message;
      setErrors(next);
      document.getElementById(`plan-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    if (needsPayment) {
      void startPayment();
      return;
    }
    onSubmit(parsed.data);
  };

  const enquiryField = (key: keyof typeof enquiry, label: string, multiline = false) => {
    const id = `plan-${key}`;
    const error = errors[key];
    const common = {
      id,
      className: inputClass,
      value: enquiry[key],
      "aria-invalid": Boolean(error) || undefined,
      "aria-describedby": describedBy(id, { error }),
    };
    return (
      <Field id={id} label={label} error={error}>
        {multiline ? (
          <textarea {...common} rows={4} onChange={(e) => setEnquiry((v) => ({ ...v, [key]: e.target.value }))} />
        ) : (
          <input {...common} type={key === "phone" ? "tel" : "text"} onChange={(e) => setEnquiry((v) => ({ ...v, [key]: e.target.value }))} />
        )}
      </Field>
    );
  };

  return (
    <form onSubmit={submit} className="space-y-6" noValidate>
      {errorField || Object.values(errors).some(Boolean) ? <ErrorBanner message={errorMessage || "Please check the highlighted fields."} /> : null}

      <div className="rounded-2xl bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-5 ring-1 ring-emerald-100">
        <p className="flex items-center gap-2 text-base font-semibold text-slate-900">
          Start free. Move to Standard when the fees cost more than the plan.
        </p>
        <p className="mt-1 text-sm text-slate-600">There&rsquo;s nothing to pay to open your shop, and you can switch plan whenever you like.</p>
      </div>

      <section aria-labelledby="plan-calc-title" className="rounded-2xl border border-slate-200 p-5">
        <h2 id="plan-calc-title" className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <Calculator className="h-4 w-4 text-slate-500" aria-hidden />
          Which plan saves you money?
        </h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_11rem] sm:items-end">
          <div>
            <label htmlFor="plan-sales-range" className="block text-sm font-medium text-slate-800">
              How much do you expect to sell each month?
            </label>
            <input
              id="plan-sales-range"
              type="range"
              min={0}
              max={SLIDER_MAX}
              step={SLIDER_STEP}
              value={Math.min(sales, SLIDER_MAX)}
              onChange={(e) => setSales(Number(e.target.value))}
              aria-valuetext={money(sales)}
              className="mt-3 w-full accent-xyvoo-teal-product-hover"
            />
            <div className="mt-1 flex justify-between text-xs text-slate-500" aria-hidden>
              <span>{money(0)}</span>
              <span>{money(SLIDER_MAX / 2)}</span>
              <span>{money(SLIDER_MAX)}+</span>
            </div>
          </div>
          <div>
            <label htmlFor="plan-sales-amount" className="block text-xs text-slate-600">
              Or type an amount
            </label>
            <div className="relative mt-1">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500" aria-hidden>
                ₦
              </span>
              <input
                id="plan-sales-amount"
                className={inputClass}
                style={{ paddingLeft: "1.75rem" }}
                inputMode="numeric"
                value={sales ? sales.toLocaleString("en-NG") : ""}
                onChange={(e) => setSales(Math.min(Number(e.target.value.replace(/\D/g, "")) || 0, 1_000_000_000))}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {(
            [
              ["free", "Free", freeCost, `${PLAN_FEE_RATES.free * 100}% of your sales`],
              ["standard", "Standard", STANDARD_PRICE, "a flat monthly price"],
            ] as const
          ).map(([id, name, cost, how]) => (
            <div key={id} className={`rounded-xl border p-4 ${bestPlan === id ? "border-xyvoo-teal-product-hover bg-emerald-50/60" : "border-slate-200"}`}>
              <p className="flex items-center justify-between text-sm font-medium text-slate-700">
                {name}
                {bestPlan === id ? <span className="rounded-full bg-xyvoo-teal-product-hover px-2.5 py-0.5 text-xs font-semibold text-[#062a27]">Best for you</span> : null}
              </p>
              <p className="mt-1 text-xl font-bold text-slate-900">{money(cost)}</p>
              <p className="text-xs text-slate-500">a month, {how}</p>
            </div>
          ))}
        </div>

        <p className="mt-4 text-sm text-slate-800" role="status">
          {bestPlan === null
            ? `At ${money(sales)} a month, both plans cost the same.`
            : bestPlan === "free"
              ? `At ${money(sales)} a month, Free saves you ${money(saving)}. Standard starts paying off once you sell more than ${money(BREAK_EVEN)} a month.`
              : `At ${money(sales)} a month, Standard saves you ${money(saving)} compared with Free.`}
          {bestPlan && bestPlan !== plan ? (
            <>
              {" "}
              <button type="button" onClick={() => setPlan(bestPlan)} className="font-semibold text-blue-800 underline underline-offset-2">
                Choose {bestPlan === "free" ? "Free" : "Standard"}
              </button>
            </>
          ) : null}
        </p>
      </section>

      <fieldset>
        <legend className="sr-only">Choose a plan</legend>
        <div className="grid gap-4 pt-3 md:grid-cols-3">
          {STOREFRONT_PLANS.map((p) => {
            const id = PLAN_IDS[p.name];
            const selected = plan === id;
            const popular = id === "standard";
            return (
              <label
                key={p.name}
                className={`relative flex cursor-pointer flex-col rounded-2xl border-2 p-5 transition-shadow ${
                  selected ? "border-xyvoo-teal-product-hover bg-emerald-50/40" : "border-slate-200"
                } ${popular ? "shadow-lg md:-translate-y-2" : ""}`}
              >
                {popular ? (
                  <span className="absolute -top-3 left-5 rounded-full bg-xyvoo-teal-product-hover px-3 py-1 text-xs font-semibold text-[#062a27] shadow-sm">
                    Most popular
                  </span>
                ) : null}
                <span className="flex items-center gap-2">
                  <input type="radio" name="plan" value={id} checked={selected} onChange={() => setPlan(id)} className="accent-xyvoo-teal-product-hover" />
                  <span className="text-base font-semibold text-slate-900">{p.name}</span>
                  {bestPlan === id ? <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">Best for you</span> : null}
                </span>
                <span className="mt-3 text-2xl font-bold text-slate-900">{naira(p.priceDisplay)}</span>
                <span className="text-sm font-medium text-slate-700">{p.feeDisplay}</span>
                <span className="mt-2 text-sm text-slate-600">{p.description}</span>
                <ul className="mt-4 space-y-1 text-sm text-slate-700">
                  {(SETUP_FEATURES[id] ?? p.features).map((f) =>
                    // "Everything in Free" stands out from the plan's own features: it's what carries over.
                    f.startsWith("Everything in") ? (
                      <li key={f} className="flex gap-2 font-semibold text-xyvoo-blue-deep">
                        <Layers className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        {f}
                      </li>
                    ) : (
                      <li key={f} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                        {f}
                      </li>
                    ),
                  )}
                </ul>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div ref={paymentMessage} tabIndex={-1} className="focus:outline-none">
        {payment.status === "checking" ? (
          <p role="status" className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-slate-500 motion-reduce:animate-none" aria-hidden />
            Confirming your payment with Paystack. Please keep this page open.
          </p>
        ) : null}
        {standardPaid ? (
          <p role="status" className="flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden />
            You&rsquo;re on the Standard plan, with no XYVOO fee on your sales. Paystack renews it monthly. Select &ldquo;Save and continue&rdquo; to carry on.
          </p>
        ) : null}
        {payment.status === "pending" ? (
          <p role="status" className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden />
            Your payment is still being processed. Refresh this page in a minute; you won&rsquo;t be charged twice.
          </p>
        ) : null}
        {payment.status === "failed" ? <ErrorBanner message={payment.message} /> : null}
      </div>

      {plan === "standard" && !standardPaid ? (
        <p className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
          {initial.billing.available
            ? `Standard is ${money(STANDARD_PRICE)} a month, paid by card on Paystack. We'll take you there to pay the first month, then bring you back here to finish setting up. You can cancel at any time from Payments and plan.`
            : "Paying for Standard online isn't available just yet. We'll save your choice, and your shop runs on the Free plan's terms (4% per order) until Standard is paid for. Nothing is charged without your say-so."}
        </p>
      ) : null}

      {plan === "enterprise" ? (
        <section aria-labelledby="plan-enterprise-title" className="space-y-4 rounded-2xl border border-slate-200 p-5">
          <h2 id="plan-enterprise-title" className="text-base font-semibold text-slate-900">
            Tell our team what you need
          </h2>
          <p className="text-sm text-slate-600">We&rsquo;ll reply to your account email. Your shop starts on Free terms while we agree yours.</p>
          {enquiryField("name", "Your name")}
          {enquiryField("phone", "Phone number")}
          {enquiryField("message", "What would you like help with?", true)}
        </section>
      ) : null}

      <StepActions
        busy={busy || payment.status === "starting" || payment.status === "checking"}
        backHref={backHref}
        submitLabel={needsPayment ? `Pay ${money(STANDARD_PRICE)} on Paystack` : "Save and continue"}
      />
    </form>
  );
}
