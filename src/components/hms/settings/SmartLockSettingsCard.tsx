"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { toastError, toastSuccess } from "@/lib/app-toast";

export function SmartLockSettingsCard({ slug }: { slug: string }) {
  const [provider, setProvider] = useState("audit_only");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/hotel/smart-lock?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => {
        const s = d.setup ?? {};
        if (s.provider) setProvider(s.provider);
        if (s.apiBaseUrl) setApiBaseUrl(s.apiBaseUrl);
      })
      .catch(() => undefined);
  }, [slug]);

  async function save() {
    setSaving(true);
    const res = await fetch("/api/hotel/smart-lock", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, provider, apiBaseUrl: apiBaseUrl || undefined, apiKey: apiKey || undefined }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      toastError("Could not save smart lock settings", String(data.error ?? "Save failed"));
      return;
    }
    toastSuccess("Smart lock settings saved");
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Smart lock integration</h2>
      <p className="mt-1 text-sm text-slate-600">
        Configure how remote unlock and key reissue reach your lock provider. Audit-only records events
        without calling external systems.
      </p>
      <div className="mt-4 space-y-3 max-w-md">
        <select
          className="h-10 w-full rounded-lg border border-input px-3 text-sm"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
        >
          <option value="audit_only">Audit only (no hardware)</option>
          <option value="mock">Mock (demo)</option>
          <option value="http_webhook">HTTP webhook</option>
        </select>
        {provider === "http_webhook" ? (
          <>
            <input
              className="h-10 w-full rounded-lg border border-input px-3 text-sm"
              placeholder="API base URL"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
            />
            <input
              className="h-10 w-full rounded-lg border border-input px-3 text-sm"
              placeholder="API key (optional)"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
            />
          </>
        ) : null}
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </section>
  );
}
