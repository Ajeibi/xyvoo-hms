"use client";

import { useEffect, useId, useState } from "react";
import { Building2 } from "lucide-react";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import {
  BILLING_WINDOWS,
  CHARGE_GROUPS,
  CHARGE_GROUP_LABEL,
  WINDOW_LABEL,
  type BillingWindow,
  type ChargeGroup,
  type RoutingRule,
  type WindowPayer,
  type WindowSummary,
} from "@/lib/hms/folio-windows-shared";
import type { FolioSplitLeg } from "@/lib/hms/folio";
import { HmsAlert, HmsCard, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";

/**
 * Who pays the bill: the guest plus up to three other payers (a company, a travel agent, one
 * other), and which payer each group of charges goes to. A payer linked to a company account is
 * billed to that account at check-out; the guest settles everything else.
 */
export function FolioWindowsPanel({
  slug,
  reservationId,
  currency,
  windows,
  editable,
  onChanged,
}: {
  slug: string;
  reservationId: string;
  currency: string;
  windows: WindowSummary[];
  editable: boolean;
  onChanged: () => void;
}) {
  const ids = useId();
  const [payers, setPayers] = useState<WindowPayer[]>([]);
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<BillingWindow | null>(null);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/hotel/folio/windows?slug=${encodeURIComponent(slug)}&reservationId=${encodeURIComponent(reservationId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setPayers(data.payers ?? []);
        setRules(data.rules ?? []);
        setAccounts(data.accounts ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug, reservationId]);

  const post = async (body: Record<string, unknown>, success: (data: { moved?: number }) => string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/hotel/folio/windows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, reservationId, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "That didn't save.");
        toastError("Not saved", data.error ?? "Please try again.");
        return false;
      }
      setPayers(data.payers ?? []);
      setRules(data.rules ?? []);
      toastSuccess("Saved", success(data));
      onChanged();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (w: BillingWindow) => {
    const p = payers.find((x) => x.window === w);
    setEditing(w);
    setName(p?.payerName ?? "");
    setAccountId(p?.arCustomerId ?? "");
    setError(null);
  };

  const savePayer = async () => {
    if (!editing) return;
    const ok = await post(
      { action: "payer", window: editing, payerName: name.trim(), arCustomerId: accountId || null },
      () => `${WINDOW_LABEL[editing]} payer saved.`,
    );
    if (ok) setEditing(null);
  };

  const targets: FolioSplitLeg[] = ["guest", ...payers.map((p) => p.window)];
  const balanceOf = (w: FolioSplitLeg) => windows.find((x) => x.window === w)?.balance ?? 0;
  const guest = windows.find((w) => w.window === "guest");

  return (
    <HmsCard
      id="folio-windows"
      icon={Building2}
      meaning="money"
      title="Who pays"
      description="Split the bill between the guest and a company, travel agent or someone else. Charges follow the rules below on their own."
    >
      <ul className="divide-y divide-slate-100 text-sm" aria-label="Payers on this bill">
        <li className="flex flex-wrap items-baseline justify-between gap-2 py-2">
          <span>
            <span className="font-medium text-slate-900">Guest</span>
            <span className="text-slate-600">: {guest?.payerName ?? "the guest"}, pays at the desk</span>
          </span>
          <span className="tabular-nums text-slate-900">{formatPricingAmount(balanceOf("guest"), currency)}</span>
        </li>
        {BILLING_WINDOWS.map((w) => {
          const p = payers.find((x) => x.window === w);
          if (!p) return null;
          return (
            <li key={w} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <span className="min-w-0">
                <span className="font-medium text-slate-900">{WINDOW_LABEL[w]}</span>
                <span className="text-slate-600">: {p.payerName}</span>
                <span className="block text-xs text-slate-600">
                  {p.arCustomerName
                    ? `Billed to the ${p.arCustomerName} account at check-out.`
                    : "Not linked to a company account, so it's paid at the desk."}
                </span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="tabular-nums text-slate-900">{formatPricingAmount(balanceOf(w), currency)}</span>
                {editable ? (
                  <>
                    <button type="button" className={hmsButton.quiet} onClick={() => startEdit(w)}>
                      Change<span className="sr-only"> {WINDOW_LABEL[w].toLowerCase()} payer</span>
                    </button>
                    <button
                      type="button"
                      className={hmsButton.danger}
                      disabled={busy}
                      onClick={() => void post({ action: "remove-payer", window: w }, () => `${WINDOW_LABEL[w]} payer removed.`)}
                    >
                      Remove<span className="sr-only"> {WINDOW_LABEL[w].toLowerCase()} payer</span>
                    </button>
                  </>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>

      {editable && !editing ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {BILLING_WINDOWS.filter((w) => !payers.some((p) => p.window === w)).map((w) => (
            <button key={w} type="button" className={hmsButton.small} onClick={() => startEdit(w)}>
              Add {w === "other" ? "another payer" : `a ${WINDOW_LABEL[w].toLowerCase()}`}
            </button>
          ))}
        </div>
      ) : null}

      {editing ? (
        <fieldset className="mt-3 space-y-3 rounded-xl border border-slate-200 p-3 text-sm">
          <legend className="px-1 font-semibold text-slate-900">{WINDOW_LABEL[editing]} payer</legend>
          <div>
            <label htmlFor={`${ids}-name`} className="mb-1 block font-medium text-slate-800">
              Who pays
            </label>
            <input id={`${ids}-name`} className={hmsInput} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder="For example: Dangote Group" />
          </div>
          <div>
            <label htmlFor={`${ids}-account`} className="mb-1 block font-medium text-slate-800">
              Company account
            </label>
            <select id={`${ids}-account`} className={`${hmsInput} cursor-pointer`} aria-describedby={`${ids}-account-hint`} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="">None: they pay at the desk</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <p id={`${ids}-account-hint`} className="mt-1 text-xs text-slate-600">
              With an account, their part is sent to Accounts as an invoice when the guest checks out. Add accounts under Accounts, Customers.
            </p>
          </div>
          {error ? <HmsAlert message={error} /> : null}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={hmsButton.primary} disabled={busy || !name.trim()} onClick={() => void savePayer()}>
              {busy ? "Saving…" : "Save payer"}
            </button>
            <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </fieldset>
      ) : null}

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-900">Send charges to</h3>
        <p className="mt-0.5 text-xs text-slate-600">
          New charges go to the payer you choose here. Changing a rule also moves the matching charges already on the bill, except ones moved by hand.
        </p>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
          {CHARGE_GROUPS.map((g: ChargeGroup) => {
            const current = rules.find((r) => r.chargeGroup === g)?.targetWindow ?? "";
            return (
              <div key={g} className="contents">
                <dt>
                  <label htmlFor={`${ids}-rule-${g}`} className="text-slate-800">
                    {CHARGE_GROUP_LABEL[g]}
                  </label>
                </dt>
                <dd>
                  <select
                    id={`${ids}-rule-${g}`}
                    className={`${hmsInput} cursor-pointer sm:w-56`}
                    disabled={!editable || busy}
                    value={current}
                    onChange={(e) =>
                      void post({ action: "rule", chargeGroup: g, target: e.target.value || null }, (d) =>
                        e.target.value
                          ? `${CHARGE_GROUP_LABEL[g]} now go to the ${WINDOW_LABEL[e.target.value as FolioSplitLeg].toLowerCase()}.${d.moved ? ` ${d.moved} line${d.moved === 1 ? "" : "s"} moved.` : ""}`
                          : "Rule removed.",
                      )
                    }
                  >
                    <option value="">{g === "all" ? "No rule (the guest)" : "No rule"}</option>
                    {targets.map((t) => (
                      <option key={t} value={t}>
                        {WINDOW_LABEL[t]}
                        {t !== "guest" ? `: ${payers.find((p) => p.window === t)?.payerName ?? ""}` : ""}
                      </option>
                    ))}
                  </select>
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </HmsCard>
  );
}
