"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Landmark } from "lucide-react";
import BankCombobox from "./BankCombobox";
import { DashAlert, dashButton, DashCard, DashField, dashInput, DashPill, DashStatus } from "./dashboard-ui";

type Account = { businessName: string; bankName: string; bankCode: string; accountName: string; accountNumberLast4: string; verifiedAt: string };
type Bank = { name: string; code: string };

/** A clear keyboard focus ring for buttons. */
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue";

/** Tells the "How you get paid" summary to refresh after a change. */
const announceChange = () => window.dispatchEvent(new Event("xyvoo:payments-changed"));

/**
 * "Get paid": the bank account Paystack pays the store's sales into. Saving
 * creates the store's Paystack subaccount; XYVOO's fee is taken at settlement.
 */
export default function PayoutAccountCard({ slug, defaultBusinessName = "" }: { slug: string; defaultBusinessName?: string }) {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [editing, setEditing] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [businessName, setBusinessName] = useState(defaultBusinessName);
  const [accountName, setAccountName] = useState("");
  // Checking the name and saving are separate, so one never looks like the other.
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch(`/api/store/payouts?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        setAvailable(Boolean(data.paymentsAvailable));
        setCanManage(Boolean(data.canManage));
        setAccount(data.account ?? null);
        setEditing(!data.account);
      })
      .catch(() => setError("We couldn't load your payout details. Please refresh the page."))
      .finally(() => setLoading(false));
  }, [slug]);

  useEffect(() => {
    if (!editing || !available || !canManage || banks.length) return;
    fetch(`/api/store/payouts/banks?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setBanks(data.banks);
      })
      .catch((e) => setError(e instanceof Error && e.message ? e.message : "We couldn't load the list of banks."));
  }, [editing, available, canManage, banks.length, slug]);

  const post = async (url: string, body: object) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, ...body }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "Something went wrong. Please try again.");
    return data;
  };

  const checkName = async () => {
    setError("");
    setAccountName("");
    if (!bankCode || !/^\d{8,16}$/.test(accountNumber)) return setError("Choose your bank and enter your account number first.");
    setChecking(true);
    try {
      const data = await post("/api/store/payouts/resolve", { bankCode, accountNumber });
      setAccountName(data.accountName);
      setStatus(`Account found: ${data.accountName}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!accountName) return setError("Check the account name before saving.");
    if (businessName.trim().length < 2) return setError("Enter the business name for payouts.");
    setBusy(true);
    try {
      const bankName = banks.find((b) => b.code === bankCode)?.name ?? "";
      const data = await post("/api/store/payouts", { bankCode, bankName, accountNumber, businessName });
      setAccount({ businessName, bankName, bankCode, accountName: data.accountName, accountNumberLast4: data.accountNumberLast4, verifiedAt: new Date().toISOString() });
      setEditing(false);
      setAccountNumber("");
      setStatus("Payout account saved. Your shop can now take payments.");
      announceChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const pill = loading ? null : !available ? (
    <DashPill>Not available yet</DashPill>
  ) : account ? (
    <DashPill tone="green">Set up</DashPill>
  ) : (
    <DashPill tone="amber">Not set up yet</DashPill>
  );

  return (
    <DashCard id="payouts" icon={Landmark} meaning="money" title="Payout account" description="Where the money from card payments goes." actions={pill}>
      <p className="text-sm text-slate-600">
        Customers pay by card or bank transfer through Paystack, and Paystack pays the money straight into this account, after XYVOO&rsquo;s fee for
        your plan.
      </p>

      <div className="mt-5 space-y-4">
        {loading ? (
          <div aria-hidden className="h-16 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
        ) : null}
        {!loading && !available ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">Payments through XYVOO aren&rsquo;t switched on yet. We&rsquo;ll let you know when you can add your bank account.</p>
        ) : null}

        <DashAlert message={error} />
        <DashStatus message={status} />

        {account && !editing ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-200/80 bg-emerald-50/50 p-4 shadow-xs">
            <div className="min-w-0 text-sm">
              <p className="flex items-center gap-2 font-semibold text-emerald-950">
                <BadgeCheck className="h-5 w-5 shrink-0 text-emerald-600" aria-hidden />
                <span className="min-w-0 break-words">{account.accountName}</span>
              </p>
              <p className="mt-0.5 break-words text-slate-600">
                {account.bankName} · account ending <strong className="font-mono font-medium text-slate-800">•••{account.accountNumberLast4}</strong> · paid as {account.businessName}
              </p>
            </div>
            {canManage && available ? (
              <button type="button" onClick={() => setEditing(true)} className={`${dashButton.secondary} ${ring}`}>
                Change account
              </button>
            ) : null}
          </div>
        ) : null}

        {available && !canManage ? <p className="text-sm text-slate-600">Only the shop owner can add or change the payout account, so your shop&rsquo;s money always goes where they expect.</p> : null}

        {editing && available && canManage ? (
          <form onSubmit={save} className="space-y-4" noValidate>
            <DashField id="payout-bank" label="Bank">
              <BankCombobox
                id="payout-bank"
                banks={banks}
                value={bankCode}
                loading={banks.length === 0 && !error}
                onChange={(code) => {
                  setBankCode(code);
                  setAccountName("");
                }}
              />
            </DashField>
            <div>
              <label htmlFor="payout-account" className="mb-1 block text-sm font-medium text-slate-800">
                Account number
              </label>
              <div className="flex gap-2">
                <input
                  id="payout-account"
                  className={`${dashInput} min-w-0`}
                  inputMode="numeric"
                  autoComplete="off"
                  value={accountNumber}
                  aria-describedby="payout-account-name"
                  onChange={(e) => {
                    setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 16));
                    setAccountName("");
                  }}
                />
                <button type="button" onClick={checkName} disabled={busy || checking} className={`${dashButton.secondary} ${ring} shrink-0`}>
                  {checking ? "Checking…" : "Check name"}
                </button>
              </div>
              <p id="payout-account-name" className="mt-2 text-sm text-slate-800">
                {accountName ? (
                  <>
                    Account name: <strong>{accountName}</strong>. If this isn&rsquo;t you, check the number.
                  </>
                ) : (
                  <span className="text-xs text-slate-500">Choose your bank, enter the number, then check the name before saving.</span>
                )}
              </p>
            </div>
            <DashField id="payout-business" label="Business name for payouts" hint="The name this shop's payouts are filed under with Paystack. Your customers never see it. Your shop's name is a good choice.">
              <input id="payout-business" className={dashInput} aria-describedby="payout-business-hint" value={businessName} onChange={(e) => setBusinessName(e.target.value)} autoComplete="organization" />
            </DashField>
            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={busy || checking || !accountName} className={`${dashButton.primary} ${ring}`}>
                {busy ? "Saving…" : "Save payout account"}
              </button>
              {account ? (
                <button type="button" onClick={() => setEditing(false)} className={`${dashButton.secondary} ${ring}`}>
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </DashCard>
  );
}
