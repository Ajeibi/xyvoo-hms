"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HandCoins } from "lucide-react";
import type { OfflinePayments } from "@/lib/store/offline-payments";
import BankCombobox from "./BankCombobox";
import { DashAlert, dashButton, DashCard, DashField, dashInput, DashPill, DashStatus, sendJson } from "./dashboard-ui";

/** A clear keyboard focus ring for buttons. */
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue";

const CARD_TITLE = "Other ways to pay";
const CARD_DESCRIPTION = "Let customers pay by bank transfer, on delivery or over WhatsApp.";

/** Which ways to pay are on, in words, from what's saved. */
function switchedOn(s: OfflinePayments, whatsappNumber: string | null) {
  return [
    s.bankTransfer.enabled && "Bank transfer",
    s.payOnDelivery.enabled && "Pay on delivery",
    s.whatsapp.enabled && whatsappNumber && "Order on WhatsApp",
  ].filter((x): x is string => Boolean(x));
}

/** Payments → Other ways to pay: bank transfer, pay on delivery and WhatsApp orders. */
export default function OfflinePaymentsCard({ slug }: { slug: string }) {
  const [settings, setSettings] = useState<OfflinePayments | null>(null);
  const [saved, setSaved] = useState<OfflinePayments | null>(null);
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [banks, setBanks] = useState<{ name: string; code: string }[]>([]);
  const [banksFailed, setBanksFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const wantsBanks = Boolean(settings?.bankTransfer.enabled) && canManage;

  // The same bank list the payout account uses, so the account name can be checked.
  useEffect(() => {
    if (!wantsBanks || banks.length || banksFailed) return;
    fetch(`/api/store/payouts/banks?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error();
        setBanks(data.banks);
      })
      .catch(() => setBanksFailed(true));
  }, [wantsBanks, banks.length, banksFailed, slug]);

  useEffect(() => {
    fetch(`/api/store/offline-payments?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        setSettings(data.settings);
        setSaved(data.settings);
        setWhatsappNumber(data.whatsappNumber);
        setCanManage(Boolean(data.canManage));
      })
      .catch(() => setError("We couldn't load these settings. Please refresh the page."));
  }, [slug]);

  if (!settings) {
    return (
      <DashCard id="offline-pay" icon={HandCoins} title={CARD_TITLE} description={CARD_DESCRIPTION}>
        {error ? (
          <DashAlert message={error} />
        ) : (
          <div aria-hidden className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
            ))}
          </div>
        )}
      </DashCard>
    );
  }

  const update = (next: OfflinePayments) => {
    setSettings(next);
    setStatus("");
  };
  const bank = settings.bankTransfer;
  // With the bank list we can check the name; without it (Paystack not set up) it stays a plain field.
  const canCheck = banks.length > 0;
  const bankCode = banks.find((b) => b.name === bank.bankName)?.code ?? "";

  const checkName = async () => {
    setError("");
    setStatus("");
    if (!bankCode || !/^\d{8,16}$/.test(bank.accountNumber)) return setError("Choose your bank and enter your account number first (8 to 16 digits).");
    setChecking(true);
    try {
      const data = await sendJson("/api/store/payouts/resolve", "POST", { slug, bankCode, accountNumber: bank.accountNumber });
      update({ ...settings, bankTransfer: { ...bank, accountName: data.accountName } });
      setStatus(`Account found: ${data.accountName}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const data = await sendJson("/api/store/offline-payments", "PATCH", { slug, settings });
      setSettings(data.settings);
      setSaved(data.settings);
      setStatus("Saved. Customers see these options at checkout.");
      window.dispatchEvent(new Event("xyvoo:payments-changed"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void, help: string) => (
    <label className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${checked ? "border-blue-200 bg-blue-50/50" : "border-slate-200"} ${canManage ? "cursor-pointer" : ""}`}>
      <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={!canManage} />
      <span>
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        <span className="block text-sm text-slate-600">{help}</span>
      </span>
    </label>
  );

  const on = saved ? switchedOn(saved, whatsappNumber) : [];

  return (
    <DashCard
      id="offline-pay"
      icon={HandCoins}
      meaning="orders"
      title={CARD_TITLE}
      description={CARD_DESCRIPTION}
      actions={on.length ? <DashPill tone="green">{on.length} active</DashPill> : <DashPill>None active</DashPill>}
    >
      <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
        {on.length ? `Switched on: ${on.join(", ")}.` : "None of these are switched on yet."}
      </p>

      <form onSubmit={save} className="mt-5 space-y-4">
        {toggle("Bank transfer", bank.enabled, (v) => update({ ...settings, bankTransfer: { ...bank, enabled: v } }), "Customers see your account details after ordering and pay into your account.")}
        {bank.enabled ? (
          <div className="grid gap-4 sm:grid-cols-2 sm:pl-7">
            <DashField id="op-bank" label="Bank name">
              {canCheck ? (
                <BankCombobox
                  id="op-bank"
                  banks={banks}
                  value={bankCode}
                  onChange={(code) => update({ ...settings, bankTransfer: { ...bank, bankName: banks.find((b) => b.code === code)?.name ?? "", accountName: "" } })}
                />
              ) : (
                <input id="op-bank" className={dashInput} value={bank.bankName} maxLength={80} onChange={(e) => update({ ...settings, bankTransfer: { ...bank, bankName: e.target.value } })} disabled={!canManage} />
              )}
            </DashField>
            <div>
              <label htmlFor="op-number" className="mb-1 block text-sm font-medium text-slate-800">
                Account number
              </label>
              <div className="flex gap-2">
                <input
                  id="op-number"
                  className={`${dashInput} min-w-0`}
                  value={bank.accountNumber}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={canCheck ? 16 : 20}
                  onChange={(e) => update({ ...settings, bankTransfer: { ...bank, accountNumber: e.target.value.replace(/\D/g, ""), ...(canCheck ? { accountName: "" } : {}) } })}
                  disabled={!canManage}
                />
                {canCheck && canManage ? (
                  <button type="button" onClick={checkName} disabled={busy || checking} className={`${dashButton.secondary} ${ring} shrink-0`}>
                    {checking ? "Checking…" : "Check name"}
                  </button>
                ) : null}
              </div>
            </div>
            <div className="sm:col-span-2">
              <DashField id="op-name" label="Account name" hint={canCheck ? "Filled in from your bank when you press Check name, so customers pay the right account." : undefined}>
                <input
                  id="op-name"
                  className={dashInput}
                  value={bank.accountName}
                  maxLength={120}
                  readOnly={canCheck}
                  placeholder={canCheck ? "Press Check name" : undefined}
                  onChange={(e) => update({ ...settings, bankTransfer: { ...bank, accountName: e.target.value } })}
                  disabled={!canManage}
                />
              </DashField>
            </div>
            <div className="sm:col-span-2">
              <DashField id="op-note" label="Note for customers" hint="For example: Use your order number as the payment reference." optional>
                <input id="op-note" className={dashInput} value={bank.note} maxLength={300} onChange={(e) => update({ ...settings, bankTransfer: { ...bank, note: e.target.value } })} aria-describedby="op-note-hint" disabled={!canManage} />
              </DashField>
            </div>
          </div>
        ) : null}

        {toggle("Pay on delivery", settings.payOnDelivery.enabled, (v) => update({ ...settings, payOnDelivery: { ...settings.payOnDelivery, enabled: v } }), "Customers pay in cash or by transfer when their order arrives.")}
        {settings.payOnDelivery.enabled ? (
          <div className="sm:pl-7">
            <DashField id="op-pod-note" label="Note for customers" hint="For example: Lagos only. Please have the exact amount ready." optional>
              <input id="op-pod-note" className={dashInput} value={settings.payOnDelivery.note} maxLength={300} onChange={(e) => update({ ...settings, payOnDelivery: { ...settings.payOnDelivery, note: e.target.value } })} aria-describedby="op-pod-note-hint" disabled={!canManage} />
            </DashField>
          </div>
        ) : null}

        {toggle("Order on WhatsApp", settings.whatsapp.enabled, (v) => update({ ...settings, whatsapp: { enabled: v } }), whatsappNumber ? `Customers send you their order on WhatsApp (${whatsappNumber}) and you arrange payment there.` : "Add your WhatsApp number in Settings first.")}
        {settings.whatsapp.enabled && !whatsappNumber ? (
          <p className="text-sm text-amber-800 sm:pl-7">
            This won&rsquo;t show at checkout until you add your WhatsApp number in{" "}
            <Link href={`/storefront/${slug}/settings`} className="underline">
              Settings
            </Link>
            .
          </p>
        ) : null}

        {canManage ? (
          <button type="submit" disabled={busy} className={`${dashButton.primary} ${ring}`}>
            {busy ? "Saving…" : "Save ways to pay"}
          </button>
        ) : (
          <p className="text-sm text-slate-600">Only the owner or an admin can change these.</p>
        )}
        <DashStatus message={status} />
        <DashAlert message={error} />
      </form>
    </DashCard>
  );
}
