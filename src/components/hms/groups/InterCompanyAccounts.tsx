"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { HmsAlert, HmsCard, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import type { InterCompanyAccount } from "@/lib/hms/groups/group-accounts";

type Hotel = { tenantId: string; name: string };
type Account = { code: string; name: string; type: string };

/** Marks the accounts hotels use for money owed between them, so the group total leaves them out. */
export function InterCompanyAccounts({
  groupSlug,
  hotels,
  accountsByHotel,
  marked,
  canEdit,
}: {
  groupSlug: string;
  hotels: Hotel[];
  accountsByHotel: Record<string, Account[]>;
  marked: InterCompanyAccount[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [tenantId, setTenantId] = useState(hotels[0]?.tenantId ?? "");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const names = new Map(hotels.map((h) => [h.tenantId, h.name]));
  const accounts = (accountsByHotel[tenantId] ?? []).filter((a) => a.type === "asset" || a.type === "liability");

  async function call(method: "POST" | "DELETE", body: { tenantId: string; code: string }) {
    setBusy(true);
    setError("");
    try {
      const url = `/api/hotel/groups/${groupSlug}/ic-accounts${method === "DELETE" ? `?tenantId=${body.tenantId}&code=${encodeURIComponent(body.code)}` : ""}`;
      const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify(body) : undefined });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "That didn't work.");
      setCode("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <HmsCard id="inter-company" title="Inter-company accounts" description="Money one hotel owes another (for example 'Due from sister hotel') cancels out in the group total.">
      <div className="space-y-4">
        <HmsAlert message={error} />
        {marked.length ? (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {marked.map((m) => (
              <li key={`${m.tenantId}-${m.code}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-sm">
                <span>
                  <span className="font-medium text-slate-900">{names.get(m.tenantId) ?? "Hotel"}</span> · account {m.code}
                  {accountsByHotel[m.tenantId]?.find((a) => a.code === m.code) ? ` (${accountsByHotel[m.tenantId]!.find((a) => a.code === m.code)!.name})` : ""}
                </span>
                {canEdit ? (
                  <button type="button" disabled={busy} className={hmsButton.danger} onClick={() => call("DELETE", { tenantId: m.tenantId, code: m.code })}>
                    Unmark
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">None marked yet. If your hotels lend to or charge each other, mark the accounts both sides use.</p>
        )}
        {canEdit ? (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (tenantId && code) void call("POST", { tenantId, code });
            }}
          >
            <div className="min-w-48">
              <HmsField id="ic-hotel" label="Hotel">
                <select id="ic-hotel" className={hmsInput} value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
                  {hotels.map((h) => (
                    <option key={h.tenantId} value={h.tenantId}>
                      {h.name}
                    </option>
                  ))}
                </select>
              </HmsField>
            </div>
            <div className="min-w-64">
              <HmsField id="ic-account" label="Account">
                <select id="ic-account" className={hmsInput} value={code} onChange={(e) => setCode(e.target.value)}>
                  <option value="">Choose an account</option>
                  {accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </HmsField>
            </div>
            <button type="submit" disabled={busy || !code} className={hmsButton.primary}>
              Mark as inter-company
            </button>
          </form>
        ) : null}
      </div>
    </HmsCard>
  );
}
