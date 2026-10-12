"use client";

import { useEffect, useState } from "react";
import { Coins } from "lucide-react";
import {
  convertFromHome,
  CURRENCY_NAMES,
  CURRENCY_ROUNDING,
  newExtraCurrency,
  ROUNDING_LABELS,
  SHOP_CURRENCIES,
  type CurrencySettings,
  type ExtraCurrency,
  type ShopCurrencyCode,
} from "@/lib/store/currencies";
import { formatShopCurrency } from "@/lib/shop/format";
import { DashAlert, dashButton, DashCard, DashField, dashInput, DashPill, DashStatus, sendJson } from "./dashboard-ui";

/** A clear keyboard focus ring for buttons. */
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue";

const CARD_TITLE = "Currencies";
const CARD_DESCRIPTION = "Let customers see your prices in other currencies.";

type Loaded = {
  homeCurrency: string;
  settings: CurrencySettings;
  liveRates: Record<string, number | null>;
  ratesUpdatedAt: string | null;
  canManage: boolean;
};

/** A typical price in each home currency, for the "for example" line. */
const EXAMPLE_AMOUNT: Record<string, number> = { NGN: 10000, KES: 1000, GHS: 100, ZAR: 100, USD: 10, GBP: 10 };

const nameOf = (code: string) => CURRENCY_NAMES[code as ShopCurrencyCode] ?? code;

/** Payments → Currencies: other currencies customers can see prices in, and how each is priced. */
export default function CurrenciesCard({ slug }: { slug: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  /** The extra currencies as last saved, for the summary line. */
  const [savedCodes, setSavedCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  useEffect(() => {
    fetch(`/api/store/currencies?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.settings) return setError("We couldn't load your currencies. Please refresh the page.");
        setData(d);
        setSavedCodes((d.settings as CurrencySettings).extra.map((c) => c.code));
      })
      .catch(() => setError("We couldn't load your currencies. Please refresh the page."));
  }, [slug]);

  if (!data) {
    return (
      <DashCard id="currencies" icon={Coins} title={CARD_TITLE} description={CARD_DESCRIPTION}>
        {error ? (
          <DashAlert message={error} />
        ) : (
          <div aria-hidden className="space-y-3">
            <div className="h-4 w-3/4 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
            <div className="flex gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-11 w-24 animate-pulse rounded-full bg-slate-100 motion-reduce:animate-none" />
              ))}
            </div>
          </div>
        )}
      </DashCard>
    );
  }

  const { homeCurrency, settings, liveRates, canManage } = data;
  const home = (amount: number) => formatShopCurrency(amount, homeCurrency);
  const example = EXAMPLE_AMOUNT[homeCurrency] ?? 100;
  const options = SHOP_CURRENCIES.filter((c) => c !== homeCurrency);

  const setSettings = (next: CurrencySettings) => {
    setData({ ...data, settings: next });
    setStatus("");
  };
  const toggleCurrency = (code: ShopCurrencyCode) => {
    const on = settings.extra.some((c) => c.code === code);
    setSettings({ extra: on ? settings.extra.filter((c) => c.code !== code) : [...settings.extra, newExtraCurrency(code)] });
  };
  const updateCurrency = (code: string, patch: Partial<ExtraCurrency>) =>
    setSettings({ extra: settings.extra.map((c) => (c.code === code ? { ...c, ...patch } : c)) });

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      const saved = await sendJson("/api/store/currencies", "PATCH", { slug, settings });
      setData({ ...data, settings: saved.settings });
      setSavedCodes((saved.settings as CurrencySettings).extra.map((c) => c.code));
      window.dispatchEvent(new Event("xyvoo:payments-changed"));
      setStatus(saved.settings.extra.length ? "Saved. Customers can now choose these currencies in your shop." : "Saved. Your shop shows prices in one currency.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DashCard
      id="currencies"
      icon={Coins}
      meaning="stock"
      title={CARD_TITLE}
      description={CARD_DESCRIPTION}
      actions={savedCodes.length ? <DashPill tone="green">{savedCodes.length + 1} currencies</DashPill> : <DashPill>{homeCurrency} only</DashPill>}
    >
      <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
        {savedCodes.length
          ? `Your prices are in ${nameOf(homeCurrency)} (${homeCurrency}). Customers can also see them in ${savedCodes.join(", ")}.`
          : `Your prices are in ${nameOf(homeCurrency)} (${homeCurrency}), and that's the only currency customers see.`}
      </p>
      <p className="mt-3 text-sm text-slate-600">
        Customers still pay in {homeCurrency}, and their bank converts it.
      </p>

      <form onSubmit={save} className="mt-5 space-y-6">
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-slate-800">Also show prices in</legend>
          <div className="flex flex-wrap gap-2">
            {options.map((code) => {
              const on = settings.extra.some((c) => c.code === code);
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={on}
                  disabled={!canManage}
                  onClick={() => toggleCurrency(code)}
                  className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors disabled:opacity-60 ${ring} ${
                    on ? "border-xyvoo-blue bg-blue-50 text-xyvoo-blue" : "border-slate-300 text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {code} <span className="font-normal text-slate-500">· {nameOf(code)}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        {settings.extra.map((c) => {
          const live = liveRates[c.code] ?? null;
          const rate = c.rateSource === "custom" ? c.customRate : live;
          const preview = rate ? convertFromHome(example, { code: c.code, rate, markupPercent: c.markupPercent, rounding: c.rounding }) : null;
          const id = `cur-${c.code}`;
          return (
            <fieldset key={c.code} className="space-y-4 rounded-xl border border-slate-200 p-4">
              <legend className="px-1 text-sm font-semibold text-slate-900">{nameOf(c.code)} ({c.code})</legend>

              <div role="radiogroup" aria-labelledby={`${id}-mode`} className="space-y-2">
                <p id={`${id}-mode`} className="text-sm font-medium text-slate-800">
                  How are prices set?
                </p>
                <label className="flex items-start gap-3 text-sm">
                  <input type="radio" name={`${id}-mode`} className="mt-1 h-4 w-4" checked={c.mode === "auto"} onChange={() => updateCurrency(c.code, { mode: "auto" })} disabled={!canManage} />
                  <span>
                    <span className="block font-medium text-slate-900">Convert my prices automatically</span>
                    <span className="block text-slate-600">You can still set your own price on any product.</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input type="radio" name={`${id}-mode`} className="mt-1 h-4 w-4" checked={c.mode === "manual"} onChange={() => updateCurrency(c.code, { mode: "manual" })} disabled={!canManage} />
                  <span>
                    <span className="block font-medium text-slate-900">I&rsquo;ll set a price on each product</span>
                    <span className="block text-slate-600">Products you haven&rsquo;t priced yet are converted automatically.</span>
                  </span>
                </label>
              </div>

              <div role="radiogroup" aria-labelledby={`${id}-rate`} className="space-y-2">
                <p id={`${id}-rate`} className="text-sm font-medium text-slate-800">
                  Exchange rate
                </p>
                <label className="flex items-start gap-3 text-sm">
                  <input type="radio" name={`${id}-rate`} className="mt-1 h-4 w-4" checked={c.rateSource === "live"} onChange={() => updateCurrency(c.code, { rateSource: "live" })} disabled={!canManage} />
                  <span className="text-slate-900">
                    Today&rsquo;s rate{live ? ` (1 ${c.code} = ${home(Math.round(live * 100) / 100)})` : ": not available right now"}, updated daily
                  </span>
                </label>
                <label className="flex items-start gap-3 text-sm">
                  <input type="radio" name={`${id}-rate`} className="mt-1 h-4 w-4" checked={c.rateSource === "custom"} onChange={() => updateCurrency(c.code, { rateSource: "custom", customRate: c.customRate ?? (live ? Math.round(live * 100) / 100 : null) })} disabled={!canManage} />
                  <span className="text-slate-900">My own rate</span>
                </label>
                {c.rateSource === "custom" ? (
                  <div className="pl-7">
                    <DashField id={`${id}-custom`} label={`${homeCurrency} for 1 ${c.code}`}>
                      <input
                        id={`${id}-custom`}
                        className={dashInput}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        value={c.customRate ?? ""}
                        onChange={(e) => updateCurrency(c.code, { customRate: e.target.value ? Number(e.target.value) : null })}
                        disabled={!canManage}
                      />
                    </DashField>
                  </div>
                ) : null}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <DashField id={`${id}-markup`} label="Add a markup (%)" hint="Optional. Covers conversion costs, for example 3." optional>
                  <input
                    id={`${id}-markup`}
                    className={dashInput}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="0.1"
                    value={c.markupPercent || ""}
                    onChange={(e) => updateCurrency(c.code, { markupPercent: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                    aria-describedby={`${id}-markup-hint`}
                    disabled={!canManage}
                  />
                </DashField>
                <DashField id={`${id}-rounding`} label="Rounding">
                  <select
                    id={`${id}-rounding`}
                    className={dashInput}
                    value={c.rounding}
                    onChange={(e) => updateCurrency(c.code, { rounding: e.target.value as ExtraCurrency["rounding"] })}
                    disabled={!canManage}
                  >
                    {CURRENCY_ROUNDING.map((r) => (
                      <option key={r} value={r}>
                        {ROUNDING_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </DashField>
              </div>

              <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {preview != null ? (
                  <>
                    For example, {home(example)} shows as <strong>{formatShopCurrency(preview, c.code)}</strong>.
                  </>
                ) : c.rateSource === "custom" ? (
                  "Enter your rate to see an example."
                ) : (
                  `We can't get today's rate for ${c.code} right now, so customers won't see this currency until we can. You can use your own rate instead.`
                )}
              </p>
            </fieldset>
          );
        })}

        {settings.extra.length ? (
          <p className="text-xs text-slate-500">
            Today&rsquo;s rates are from{" "}
            <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener noreferrer" className="underline">
              ExchangeRate-API<span className="sr-only"> (opens in a new tab)</span>
            </a>
            {data.ratesUpdatedAt ? `, last updated ${new Date(data.ratesUpdatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}` : ""}.
          </p>
        ) : null}

        {canManage ? (
          <button type="submit" disabled={busy} className={`${dashButton.primary} ${ring}`}>
            {busy ? "Saving…" : "Save currencies"}
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
