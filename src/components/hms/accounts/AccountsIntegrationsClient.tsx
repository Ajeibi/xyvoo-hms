"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleAlert, Link2, RefreshCw } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import { suggestMappings } from "@/lib/hms/accounting-sync/mapping";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsField, HmsPage, HmsPageHeader, HmsPill, HmsWarning, hmsButton, hmsInput } from "@/components/hms/hms-ui";

type Status = "pending" | "sent" | "failed" | "skipped";
type Connection = {
  status: "connected" | "needs_reauth" | "disconnected" | "pending_business";
  businessId: string | null;
  businessName: string | null;
  currency: string | null;
  syncFrom: string;
  connectedAt: string | null;
  lastError: string | null;
  pendingBusinesses: { id: string; name: string; currency: string | null }[] | null;
};
type QueueItem = {
  id: string;
  journalEntryId: string;
  status: Status;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
  entryDate?: string | null;
  memo?: string | null;
};
type SageAccount = { id: string; code: string | null; name: string; type: string | null };
type Data = {
  connection: Connection | null;
  counts: Record<Status, number>;
  queue: QueueItem[];
  mapping: { accountCode: string; externalAccountId: string; externalAccountName: string }[];
  chart: { code: string; name: string; type: string }[];
};

const RETURN_MESSAGES: Record<string, string> = {
  connected: "Sage is connected.",
  pick: "Sage is connected. Choose which business to use.",
  denied: "Sage access was not granted.",
  invalid_state: "That sign-in link expired or was not for this hotel. Please try again.",
  forbidden: "Only the owner or an admin can connect Sage.",
  no_business: "No Sage business was found on that login.",
  not_configured: "Sage is not set up on this server yet.",
  error: "Could not finish connecting to Sage. Please try again.",
};

const TONE: Record<Status, "slate" | "green" | "amber" | "red"> = { pending: "amber", sent: "green", failed: "red", skipped: "slate" };

export function AccountsIntegrationsClient({
  slug,
  today,
  canManage,
  canAccessAllDepartments,
}: {
  slug: string;
  today: string;
  canManage: boolean;
  canAccessAllDepartments: boolean;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [busy, setBusy] = useState(false);
  const [syncFrom, setSyncFrom] = useState(`${today.slice(0, 7)}-01`);
  const [business, setBusiness] = useState("");
  const [sageAccounts, setSageAccounts] = useState<SageAccount[] | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [returned, setReturned] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q = filter === "all" ? "" : `&status=${filter}`;
    const res = await fetch(`/api/hotel/accounts/sage?slug=${encodeURIComponent(slug)}${q}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not load Sage sync", json.error ?? "Try again.");
      return;
    }
    setData(json as Data);
  }, [slug, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("sage");
    if (code) setReturned(code);
  }, []);

  useEffect(() => {
    if (data?.connection?.syncFrom) setSyncFrom(data.connection.syncFrom);
    const next: Record<string, string> = {};
    for (const m of data?.mapping ?? []) next[m.accountCode] = m.externalAccountId;
    setDraft(next);
  }, [data?.connection?.syncFrom, data?.mapping]);

  const post = async (body: Record<string, unknown>, done?: (json: Record<string, unknown>) => string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/accounts/sage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Sage sync", json.error ?? "Try again.");
        return null;
      }
      if (done) toastSuccess(done(json));
      await load();
      return json as Record<string, unknown>;
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm("Disconnect Sage? Journals stop being sent. Nothing already in Sage is removed.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/accounts/sage/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) toastError("Could not disconnect", json.error ?? "Try again.");
      else toastSuccess("Sage disconnected.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const loadSageAccounts = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/hotel/accounts/sage?slug=${encodeURIComponent(slug)}&sageAccounts=1`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not load Sage accounts", json.error ?? "Try again.");
        return;
      }
      setSageAccounts(json.accounts as SageAccount[]);
    } finally {
      setBusy(false);
    }
  };

  const suggest = () => {
    if (!data || !sageAccounts) return;
    const found = suggestMappings(data.chart, sageAccounts, draft);
    setDraft((d) => ({ ...d, ...Object.fromEntries(Object.entries(found).map(([code, a]) => [code, a.id])) }));
    toastSuccess(`${Object.keys(found).length} suggestion${Object.keys(found).length === 1 ? "" : "s"} filled in. Review, then save.`);
  };

  const saveMapping = async () => {
    if (!data) return;
    const names = new Map((sageAccounts ?? []).map((a) => [a.id, a.name]));
    const known = new Map(data.mapping.map((m) => [m.externalAccountId, m.externalAccountName]));
    const rows = data.chart
      .filter((a) => (draft[a.code] ?? "") !== (data.mapping.find((m) => m.accountCode === a.code)?.externalAccountId ?? ""))
      .map((a) => ({
        accountCode: a.code,
        externalAccountId: draft[a.code] ?? "",
        externalAccountName: names.get(draft[a.code] ?? "") ?? known.get(draft[a.code] ?? "") ?? "",
      }));
    if (rows.length === 0) {
      toastSuccess("Nothing to save.");
      return;
    }
    await post({ action: "save_mapping", rows }, (j) => `Mapping saved.${Number(j.requeued) ? ` ${j.requeued} waiting journal(s) will be sent.` : ""}`);
  };

  const conn = data?.connection ?? null;
  const connected = conn?.status === "connected";
  const unmapped = useMemo(() => (data?.chart ?? []).filter((a) => !draft[a.code]), [data, draft]);
  const connectHref = `/api/hotel/accounts/sage/connect?slug=${encodeURIComponent(slug)}&syncFrom=${syncFrom}`;

  return (
    <HmsPage>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Integrations"
        description="Connect your own Sage Accounting. Journals posted in XYVOO are copied to Sage automatically. XYVOO stays the master record; Sage holds a copy."
      />
      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {returned && RETURN_MESSAGES[returned] ? (
        <HmsWarning>{RETURN_MESSAGES[returned]}</HmsWarning>
      ) : null}
      {conn?.status === "needs_reauth" ? (
        <HmsWarning title="Sage needs to be connected again">
          {conn.lastError ?? "The connection expired."} Journals are held in the queue until you reconnect.
        </HmsWarning>
      ) : null}

      <HmsCard id="sage-connection" title="Sage Accounting" icon={Link2} meaning="money">
        {!data ? (
          <p className="text-sm text-slate-600">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <HmsPill tone={connected ? "green" : conn?.status === "needs_reauth" ? "red" : "slate"}>
                {connected ? "Connected" : conn?.status === "needs_reauth" ? "Needs reconnecting" : conn?.status === "pending_business" ? "Choose a business" : "Not connected"}
              </HmsPill>
              {connected ? (
                <span className="text-sm text-slate-700">
                  {conn?.businessName} {conn?.currency ? `· ${conn.currency}` : ""} {conn?.connectedAt ? `· since ${formatDateTime(conn.connectedAt)}` : ""}
                </span>
              ) : null}
            </div>

            {conn?.status === "pending_business" && canManage ? (
              <div className="max-w-md space-y-2">
                <HmsField id="sage-business" label="Which Sage business should this hotel use?">
                  <select id="sage-business" className={hmsInput} value={business} onChange={(e) => setBusiness(e.target.value)}>
                    <option value="">Choose…</option>
                    {(conn.pendingBusinesses ?? []).map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} {b.currency ? `(${b.currency})` : ""}
                      </option>
                    ))}
                  </select>
                </HmsField>
                <button type="button" className={hmsButton.primary} disabled={busy || !business} onClick={() => void post({ action: "choose_business", businessId: business }, () => "Business chosen.")}>
                  Use this business
                </button>
              </div>
            ) : null}

            {(!conn || conn.status === "disconnected" || conn.status === "needs_reauth") && canManage ? (
              <div className="flex flex-wrap items-end gap-3">
                <HmsField id="sage-sync-from" label="Send journals dated from" hint="Earlier journals are never sent unless you queue them below.">
                  <input id="sage-sync-from" type="date" className={hmsInput} value={syncFrom} onChange={(e) => setSyncFrom(e.target.value)} />
                </HmsField>
                <a className={hmsButton.primary} href={connectHref}>
                  {conn?.status === "needs_reauth" ? "Reconnect Sage" : "Connect Sage"}
                </a>
              </div>
            ) : null}
            {!canManage && !connected ? <p className="text-sm text-slate-600">Only the owner or an admin can connect Sage.</p> : null}

            {connected ? (
              <div className="flex flex-wrap items-end gap-3">
                {canManage ? (
                  <>
                    <HmsField id="sage-sync-from2" label="Send journals dated from">
                      <input id="sage-sync-from2" type="date" className={hmsInput} value={syncFrom} onChange={(e) => setSyncFrom(e.target.value)} />
                    </HmsField>
                    <button type="button" className={hmsButton.secondary} disabled={busy || syncFrom === conn?.syncFrom} onClick={() => void post({ action: "set_sync_from", syncFrom }, () => "Date saved.")}>
                      Save date
                    </button>
                    <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void post({ action: "queue_existing" }, (j) => `${j.queued} existing journal(s) queued.`)}>
                      Queue journals already posted
                    </button>
                  </>
                ) : null}
                <button type="button" className={hmsButton.secondary} disabled={busy} onClick={() => void post({ action: "sync_now" }, (j) => { const r = j.result as { sent: number; failed: number; skipped: number }; return `Sync done: ${r.sent} sent, ${r.skipped} skipped, ${r.failed} failed.`; })}>
                  <RefreshCw className="h-4 w-4" aria-hidden /> Sync now
                </button>
                {canManage ? (
                  <button type="button" className={hmsButton.danger} disabled={busy} onClick={() => void disconnect()}>
                    Disconnect
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        )}
      </HmsCard>

      {connected && canManage && data ? (
        <HmsCard
          id="sage-mapping"
          title="Account mapping"
          description="Each XYVOO account needs a Sage ledger account. A journal that uses an unmapped account waits until you map it."
          meaning="money"
          actions={
            <div className="flex gap-2">
              {!sageAccounts ? (
                <button type="button" className={hmsButton.small} disabled={busy} onClick={() => void loadSageAccounts()}>
                  Load Sage accounts
                </button>
              ) : (
                <button type="button" className={hmsButton.small} disabled={busy} onClick={suggest}>
                  Suggest
                </button>
              )}
              <button type="button" className={hmsButton.small} disabled={busy} onClick={() => void saveMapping()}>
                Save mapping
              </button>
            </div>
          }
        >
          {unmapped.length > 0 ? (
            <p className="mb-3 flex items-center gap-2 text-sm text-amber-800">
              <CircleAlert className="h-4 w-4" aria-hidden /> {unmapped.length} account{unmapped.length === 1 ? "" : "s"} not mapped yet.
            </p>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-2 pr-3">XYVOO account</th>
                  <th className="py-2">Sage ledger account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.chart.map((a) => {
                  const current = data.mapping.find((m) => m.accountCode === a.code);
                  const value = draft[a.code] ?? "";
                  return (
                    <tr key={a.code}>
                      <td className="py-2 pr-3">
                        <span className="font-medium text-slate-900">{a.code}</span> {a.name}
                      </td>
                      <td className="py-2">
                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Sage account for ${a.code} ${a.name}`}
                            className={hmsInput}
                            value={value}
                            onChange={(e) => setDraft((d) => ({ ...d, [a.code]: e.target.value }))}
                          >
                            <option value="">Not mapped</option>
                            {value && !(sageAccounts ?? []).some((s) => s.id === value) ? <option value={value}>{current?.externalAccountName || value}</option> : null}
                            {(sageAccounts ?? []).map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.code ? `${s.code} · ` : ""}
                                {s.name}
                              </option>
                            ))}
                          </select>
                          {!value ? <HmsPill tone="amber">Unmapped</HmsPill> : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </HmsCard>
      ) : null}

      {data && conn && conn.status !== "disconnected" ? (
        <HmsCard id="sage-log" title="Sync log" meaning="money">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {(["all", "pending", "sent", "failed", "skipped"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-pressed={filter === s}
                onClick={() => setFilter(s)}
                className={`rounded-full border px-3 py-1 text-sm ${filter === s ? "border-emerald-600 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-700"}`}
              >
                {s === "all" ? "All" : `${s[0].toUpperCase()}${s.slice(1)} (${data.counts[s]})`}
              </button>
            ))}
            {data.counts.failed > 0 ? (
              <button type="button" className={hmsButton.small} disabled={busy} onClick={() => void post({ action: "retry" }, (j) => `${j.count} failed journal(s) queued again.`)}>
                Retry all failed
              </button>
            ) : null}
          </div>
          {data.queue.length === 0 ? (
            <p className="text-sm text-slate-600">Nothing here yet.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.queue.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{r.memo ?? r.journalEntryId}</p>
                    <p className="text-xs text-slate-600">
                      {r.entryDate ?? ""} · attempts {r.attempts}
                      {r.sentAt ? ` · sent ${formatDateTime(r.sentAt)}` : ""}
                    </p>
                    {r.lastError ? <p className="mt-1 text-xs text-rose-800">{r.lastError}</p> : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <HmsPill tone={TONE[r.status]}>{r.status}</HmsPill>
                    {r.status === "failed" || r.status === "skipped" ? (
                      <button type="button" className={hmsButton.small} disabled={busy} onClick={() => void post({ action: "retry", id: r.id }, () => "Queued again.")}>
                        Retry
                      </button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </HmsCard>
      ) : null}
    </HmsPage>
  );
}
