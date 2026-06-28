"use client";

import { useEffect, useState } from "react";

export function UnlockKeyPanel({ slug, action }: { slug: string; action: "unlock" | "key-reissue" }) {
  const [providerMode, setProviderMode] = useState<string>("audit_only");

  useEffect(() => {
    fetch(`/api/hotel/smart-lock?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setProviderMode(d.setup?.provider ?? "audit_only"))
      .catch(() => setProviderMode("audit_only"));
  }, [slug]);

  const hint =
    providerMode === "audit_only"
      ? "Recorded only — configure a smart lock provider in Settings to send commands remotely."
      : providerMode === "mock"
        ? "Mock provider — unlock/reissue will be simulated for demo."
        : "Commands will be sent to your configured lock webhook.";

  return (
    <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      {action === "unlock" ? "Remote unlock" : "Key reissue"} ·{" "}
      <span className="font-medium capitalize">{providerMode.replace(/_/g, " ")}</span>
      <br />
      {hint}
    </p>
  );
}
