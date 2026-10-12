"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, KeyRound } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { DashAlert, dashButton, DashCard, DashField, dashInput, DashPill } from "./dashboard-ui";

/** A clear keyboard focus ring for buttons. */
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue";

const CARD_TITLE = "Your own Paystack keys";
const CARD_DESCRIPTION = "Only for shops set up before payouts through XYVOO.";

type PaystackSetup = {
  enabled: boolean;
  mode: "test" | "live";
  publicKey: string;
  secretKey: string;
  webhookSecret: string;
};

const EMPTY_SETUP: PaystackSetup = { enabled: false, mode: "test", publicKey: "", secretKey: "", webhookSecret: "" };

export default function StorefrontSettingsClient({ slug }: { slug: string }) {
  const [setup, setSetup] = useState<PaystackSetup>(EMPTY_SETUP);
  /** Whether payments were on when last loaded or saved, for the status pill. */
  const [savedEnabled, setSavedEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- window.location is only available client-side, so this can't be computed during render */
    setWebhookUrl(`${window.location.origin}/api/webhooks/paystack`);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/store/settings?slug=${encodeURIComponent(slug)}`);
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Failed to load settings.");
        if (!cancelled) {
          setSetup({ ...EMPTY_SETUP, ...data.paystackSetup });
          setSavedEnabled(Boolean(data.paystackSetup?.enabled));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const field = <K extends keyof PaystackSetup>(key: K, value: PaystackSetup[K]) =>
    setSetup((prev) => ({ ...prev, [key]: value }));

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/store/settings?slug=${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paystackSetup: setup }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = typeof data.error === "string" ? data.error : "Failed to save settings.";
        setError(message);
        toastError("Save failed", message);
        return;
      }

      setSavedEnabled(setup.enabled);
      toastSuccess("Settings saved", "Your Paystack configuration has been updated.");
      window.dispatchEvent(new Event("xyvoo:payments-changed"));
    } catch {
      const message = "We couldn't reach the server. Check your connection and try again.";
      setError(message);
      toastError("Connection problem", message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <DashCard id="own-keys" icon={KeyRound} title={CARD_TITLE} description={CARD_DESCRIPTION}>
        <div aria-hidden className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 animate-pulse rounded-xl bg-slate-100 motion-reduce:animate-none" />
          ))}
        </div>
      </DashCard>
    );
  }

  return (
    <DashCard
      id="own-keys"
      icon={KeyRound}
      title={CARD_TITLE}
      description={CARD_DESCRIPTION}
      actions={savedEnabled ? <DashPill tone="green">Taking payments</DashPill> : <DashPill>Switched off</DashPill>}
    >
      <p className="text-sm text-slate-600">
        Once you add a payout account above, payments go through XYVOO instead and these keys are no longer used.
      </p>

      <form onSubmit={handleSave} className="mt-5 space-y-4">
        <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p id="paystack-enabled-label" className="text-sm font-medium text-slate-800">
              Accept payments
            </p>
            <p id="paystack-enabled-hint" className="text-xs text-slate-600">
              Turn this on once your keys below are correct.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={setup.enabled}
            aria-labelledby="paystack-enabled-label"
            aria-describedby="paystack-enabled-hint"
            onClick={() => field("enabled", !setup.enabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${ring} ${setup.enabled ? "bg-xyvoo-blue" : "bg-slate-400"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
                setup.enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <DashField id="paystack-mode" label="Mode">
          <select id="paystack-mode" className={dashInput} value={setup.mode} onChange={(e) => field("mode", e.target.value as PaystackSetup["mode"])}>
            <option value="test">Test</option>
            <option value="live">Live</option>
          </select>
        </DashField>

        <DashField id="paystack-public-key" label="Public key">
          <input
            id="paystack-public-key"
            className={dashInput}
            placeholder="pk_test_..."
            value={setup.publicKey}
            onChange={(e) => field("publicKey", e.target.value)}
            autoComplete="off"
          />
        </DashField>

        <DashField id="paystack-secret-key" label="Secret key">
          <div className="relative">
            <input
              id="paystack-secret-key"
              className={`${dashInput} pr-11`}
              type={showSecret ? "text" : "password"}
              placeholder="sk_test_..."
              value={setup.secretKey}
              onChange={(e) => field("secretKey", e.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              aria-label={showSecret ? "Hide secret key" : "Show secret key"}
              aria-pressed={showSecret}
              onClick={() => setShowSecret((v) => !v)}
              className={`absolute inset-y-0 right-0 rounded-r-xl px-3 text-slate-600 hover:text-slate-800 ${ring}`}
            >
              {showSecret ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
            </button>
          </div>
        </DashField>

        <DashField id="paystack-webhook-secret" label="Webhook secret">
          <input
            id="paystack-webhook-secret"
            className={dashInput}
            placeholder="Paystack webhook signing secret"
            value={setup.webhookSecret}
            onChange={(e) => field("webhookSecret", e.target.value)}
            autoComplete="off"
          />
        </DashField>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-sm font-medium text-slate-800">Webhook URL</p>
          <p className="mt-1 break-all font-mono text-xs text-slate-700">{webhookUrl}</p>
          <p className="mt-1 text-xs text-slate-600">Paste this into your Paystack dashboard under Settings → API Keys &amp; Webhooks.</p>
        </div>

        <DashAlert message={error} />

        <button type="submit" disabled={saving} className={`${dashButton.primary} ${ring}`}>
          {saving ? "Saving…" : "Save Paystack keys"}
        </button>
      </form>
    </DashCard>
  );
}
