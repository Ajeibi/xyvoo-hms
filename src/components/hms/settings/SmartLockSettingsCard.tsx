"use client";

import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import { HmsCard, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";

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
    <HmsCard
      id="smart-lock-settings"
      title="Smart lock integration"
      description="How remote unlock and key reissue reach your door-lock provider. Audit only records events without calling outside systems."
      icon={KeyRound}
      meaning="rooms"
      actions={
        <SettingsSectionInfo
          title="Smart lock integration"
          text="One-time technical setup connecting XYVOO to your physical door-lock provider so front desk can remotely unlock or reissue keys. Only touch this again if you switch lock vendors or rotate API credentials."
        />
      }
    >
      <div className="max-w-md space-y-4">
        <HmsField id="smart-lock-provider" label="Lock provider">
          <select
            id="smart-lock-provider"
            className={hmsInput}
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            <option value="audit_only">Audit only (no hardware)</option>
            <option value="mock">Mock (demo)</option>
            <option value="http_webhook">HTTP webhook</option>
          </select>
        </HmsField>
        {provider === "http_webhook" ? (
          <>
            <HmsField id="smart-lock-api-url" label="API base URL">
              <input
                id="smart-lock-api-url"
                className={hmsInput}
                placeholder="https://"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
              />
            </HmsField>
            <HmsField id="smart-lock-api-key" label="API key" optional>
              <input
                id="smart-lock-api-key"
                className={hmsInput}
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
            </HmsField>
          </>
        ) : null}
        <button type="button" onClick={save} disabled={saving} className={hmsButton.primary}>
          {saving ? "Saving…" : "Save lock settings"}
        </button>
      </div>
    </HmsCard>
  );
}
