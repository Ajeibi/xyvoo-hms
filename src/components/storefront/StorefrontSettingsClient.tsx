"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, CircleAlert, CheckCircle2 } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";

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
        if (!cancelled) setSetup({ ...EMPTY_SETUP, ...data.paystackSetup });
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

      toastSuccess("Settings saved", "Your Paystack configuration has been updated.");
    } catch {
      const message = "We couldn't reach the server. Check your connection and try again.";
      setError(message);
      toastError("Connection problem", message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading settings…</p>;
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold text-slate-900">Payment settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Connect your own Paystack account so customer payments are captured directly into it.
      </p>

      <form onSubmit={handleSave} className="mt-6 space-y-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-800">Accept payments</p>
            <p className="text-xs text-slate-500">Turn this on once your keys below are correct.</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={setup.enabled}
            onClick={() => field("enabled", !setup.enabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
              setup.enabled ? "bg-xyvoo-blue" : "bg-slate-300"
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                setup.enabled ? "translate-x-5" : "translate-x-0.5"
              }`}
            />
          </button>
        </div>

        <div>
          <label htmlFor="paystack-mode" className="mb-1 block text-xs font-medium text-slate-600">
            Mode
          </label>
          <select
            id="paystack-mode"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
            value={setup.mode}
            onChange={(e) => field("mode", e.target.value as PaystackSetup["mode"])}
          >
            <option value="test">Test</option>
            <option value="live">Live</option>
          </select>
        </div>

        <div>
          <label htmlFor="paystack-public-key" className="mb-1 block text-xs font-medium text-slate-600">
            Public key
          </label>
          <input
            id="paystack-public-key"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
            placeholder="pk_test_..."
            value={setup.publicKey}
            onChange={(e) => field("publicKey", e.target.value)}
            autoComplete="off"
          />
        </div>

        <div>
          <label htmlFor="paystack-secret-key" className="mb-1 block text-xs font-medium text-slate-600">
            Secret key
          </label>
          <div className="relative">
            <input
              id="paystack-secret-key"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-11 text-sm"
              type={showSecret ? "text" : "password"}
              placeholder="sk_test_..."
              value={setup.secretKey}
              onChange={(e) => field("secretKey", e.target.value)}
              autoComplete="off"
            />
            <button
              type="button"
              aria-label={showSecret ? "Hide secret key" : "Show secret key"}
              onClick={() => setShowSecret((v) => !v)}
              className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="paystack-webhook-secret" className="mb-1 block text-xs font-medium text-slate-600">
            Webhook secret
          </label>
          <input
            id="paystack-webhook-secret"
            className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm"
            placeholder="Paystack webhook signing secret"
            value={setup.webhookSecret}
            onChange={(e) => field("webhookSecret", e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium text-slate-600">Webhook URL</p>
          <p className="mt-1 break-all text-xs text-slate-500">{webhookUrl}</p>
          <p className="mt-1 text-[11px] text-slate-400">
            Paste this into your Paystack dashboard under Settings → API Keys & Webhooks.
          </p>
        </div>

        {error ? (
          <div role="alert" className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
            <p>{error}</p>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={saving}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-xyvoo-blue py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          <CheckCircle2 className="h-4 w-4" />
          {saving ? "Saving…" : "Save settings"}
        </button>
      </form>
    </div>
  );
}
