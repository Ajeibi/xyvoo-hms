"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/app-toast";

export function PaystackSettingsCard({ slug }: { slug: string }) {
  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState<"test" | "live">("test");
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [hasSecretKey, setHasSecretKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/hotel/paystack?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => {
        const s = d.setup ?? {};
        setEnabled(Boolean(s.enabled));
        setMode(s.mode === "live" ? "live" : "test");
        if (s.publicKey) setPublicKey(s.publicKey);
        setHasSecretKey(Boolean(s.hasSecretKey));
        setWebhookUrl(d.webhookUrl ?? "");
      })
      .catch(() => undefined);
  }, [slug]);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/hotel/paystack", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        enabled,
        mode,
        publicKey: publicKey || undefined,
        secretKey: secretKey || undefined,
        webhookSecret: webhookSecret || undefined,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toastError("Could not save Paystack settings", String(data.error ?? "Save failed"));
      return;
    }
    setHasSecretKey(Boolean(data.setup?.hasSecretKey));
    setSecretKey("");
    setWebhookSecret("");
    toastSuccess("Paystack settings saved");
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Paystack (card payments)</h2>
      <p className="mt-1 text-sm text-slate-600">
        Connect your hotel&apos;s Paystack account to take card payments on guest folios. Cash and POS
        terminal payments are recorded manually on the folio.
      </p>
      <div className="mt-4 space-y-3 max-w-lg">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
          Enable Paystack for this property
        </label>
        <select
          className="h-10 w-full rounded-lg border border-input px-3 text-sm"
          value={mode}
          onChange={(e) => setMode(e.target.value as "test" | "live")}
        >
          <option value="test">Test mode</option>
          <option value="live">Live mode</option>
        </select>
        <input
          className="h-10 w-full rounded-lg border border-input px-3 text-sm"
          placeholder="Public key (pk_test_… or pk_live_…)"
          value={publicKey}
          onChange={(e) => setPublicKey(e.target.value)}
        />
        <input
          className="h-10 w-full rounded-lg border border-input px-3 text-sm"
          placeholder={hasSecretKey ? "Secret key (saved — enter to replace)" : "Secret key (sk_test_… or sk_live_…)"}
          type="password"
          value={secretKey}
          onChange={(e) => setSecretKey(e.target.value)}
        />
        <input
          className="h-10 w-full rounded-lg border border-input px-3 text-sm"
          placeholder="Webhook secret (optional — defaults to secret key)"
          type="password"
          value={webhookSecret}
          onChange={(e) => setWebhookSecret(e.target.value)}
        />
        {webhookUrl ? (
          <p className="text-xs text-slate-500 break-all">
            Webhook URL (add in Paystack dashboard): <span className="font-mono">{webhookUrl}</span>
          </p>
        ) : null}
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  );
}
