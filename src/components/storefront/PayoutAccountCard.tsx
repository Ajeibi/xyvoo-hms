"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, CircleAlert, Landmark } from "lucide-react";

type Account = { businessName: string; bankName: string; bankCode: string; accountName: string; accountNumberLast4: string; verifiedAt: string };
type Bank = { name: string; code: string };

const inputClass = "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-xyvoo-blue";

/**
 * "Get paid": the bank account Paystack pays the store's sales into. Saving
 * creates the store's Paystack subaccount; XYVOO's fee is taken at settlement.
 */
export default function PayoutAccountCard({ slug }: { slug: string }) {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [account, setAccount] = useState<Account | null>(null);
  const [editing, setEditing] = useState(false);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [accountName, setAccountName] = useState("");
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
    setBusy(true);
    try {
      const data = await post("/api/store/payouts/resolve", { bankCode, accountNumber });
      setAccountName(data.accountName);
      setStatus(`Account found: ${data.accountName}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
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
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="payouts-title" className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-start gap-3">
        <Landmark className="mt-0.5 h-5 w-5 text-slate-500" aria-hidden />
        <div>
          <h2 id="payouts-title" className="text-base font-semibold text-slate-900">
            Get paid
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            The bank account your sales are paid into. Customers pay by card or bank transfer through Paystack, and Paystack pays you directly, after
            XYVOO&rsquo;s fee for your plan.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4">
        {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}
        {!loading && !available ? (
          <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">Payments through XYVOO aren&rsquo;t switched on yet. We&rsquo;ll let you know when you can add your bank account.</p>
        ) : null}

        {error ? (
          <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
            <p>{error}</p>
          </div>
        ) : null}
        <p role="status" className="text-sm text-emerald-700">
          {status}
        </p>

        {account && !editing ? (
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
            <div className="text-sm">
              <p className="flex items-center gap-2 font-medium text-slate-900">
                <BadgeCheck className="h-4 w-4 text-emerald-600" aria-hidden />
                {account.accountName}
              </p>
              <p className="text-slate-600">
                {account.bankName} · account ending {account.accountNumberLast4} · paid as {account.businessName}
              </p>
            </div>
            {canManage && available ? (
              <button type="button" onClick={() => setEditing(true)} className="text-sm font-medium text-blue-700 hover:underline">
                Change account
              </button>
            ) : null}
          </div>
        ) : null}

        {editing && available && canManage ? (
          <form onSubmit={save} className="space-y-4" noValidate>
            <div>
              <label htmlFor="payout-bank" className="mb-1 block text-sm font-medium text-slate-800">
                Bank
              </label>
              <select
                id="payout-bank"
                className={inputClass}
                value={bankCode}
                onChange={(e) => {
                  setBankCode(e.target.value);
                  setAccountName("");
                }}
              >
                <option value="">{banks.length ? "Choose your bank" : "Loading banks…"}</option>
                {banks.map((b) => (
                  <option key={b.code} value={b.code}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="payout-account" className="mb-1 block text-sm font-medium text-slate-800">
                Account number
              </label>
              <div className="flex gap-2">
                <input
                  id="payout-account"
                  className={inputClass}
                  inputMode="numeric"
                  autoComplete="off"
                  value={accountNumber}
                  onChange={(e) => {
                    setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 16));
                    setAccountName("");
                  }}
                />
                <button type="button" onClick={checkName} disabled={busy} className="shrink-0 rounded-xl border border-slate-300 px-4 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60">
                  Check name
                </button>
              </div>
              {accountName ? <p className="mt-2 text-sm text-slate-800">Account name: <strong>{accountName}</strong>. If this isn&rsquo;t you, check the number.</p> : null}
            </div>
            <div>
              <label htmlFor="payout-business" className="mb-1 block text-sm font-medium text-slate-800">
                Business name for payouts
              </label>
              <input id="payout-business" className={inputClass} value={businessName} onChange={(e) => setBusinessName(e.target.value)} autoComplete="organization" />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy || !accountName} className="rounded-xl bg-xyvoo-blue px-5 py-3 text-sm font-semibold text-white disabled:opacity-60">
                {busy ? "Saving…" : "Save payout account"}
              </button>
              {account ? (
                <button type="button" onClick={() => setEditing(false)} className="text-sm font-medium text-slate-600 hover:underline">
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        ) : null}
      </div>
    </section>
  );
}
