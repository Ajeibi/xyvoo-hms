"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { toastError, toastInfo, toastSuccess } from "@/lib/app-toast";
import { SettingsSectionInfo } from "@/components/hms/settings/SettingsSectionInfo";
import { HmsCard, HmsField, HmsWarning, hmsButton, hmsInput } from "@/components/hms/hms-ui";

type ProviderInfo = { id: string; label: string; needs: string; hasCloudAccount: boolean };
type RoomRow = { id: string; code: string; lockId: string | null; lockLabel: string | null; battery: number | null };
type EventRow = { id: number; provider: string; action: string; ok: boolean; error: string | null; createdAt: string };
type State = {
  providers: ProviderInfo[];
  serverReady: { ttlock: boolean };
  connection: {
    provider: string;
    fromOldSetting: boolean;
    signedIn: boolean;
    hasGateway: boolean;
    apiBaseUrl: string | null;
    lastTestedAt: string | null;
    lastError: string | null;
  };
  lowBatteryPercent: number;
  rooms: RoomRow[];
  events: EventRow[];
};
type ProviderLock = { externalLockId: string; label: string; battery: number | null };

const ACTION_WORDS: Record<string, string> = {
  test: "Connection test",
  issue_code: "Door code made",
  revoke_code: "Door code cancelled",
  unlock: "Remote unlock",
  battery: "Battery check",
};

export function SmartLockSettingsCard({ slug }: { slug: string }) {
  const [state, setState] = useState<State | null>(null);
  const [choice, setChoice] = useState("audit_only");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [gateway, setGateway] = useState(false);
  const [locks, setLocks] = useState<ProviderLock[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const apply = useCallback((d: State) => {
    setState(d);
    setChoice(d.connection.provider);
    setApiBaseUrl(d.connection.apiBaseUrl ?? "");
    setGateway(d.connection.hasGateway);
  }, []);

  const url = `/api/hotel/integrations/locks?slug=${encodeURIComponent(slug)}`;
  const load = useCallback(async () => {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) apply((await res.json()) as State);
  }, [url, apply]);

  useEffect(() => {
    let live = true;
    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: State | null) => {
        if (live && d) apply(d);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [url, apply]);

  async function act(name: string, payload: Record<string, unknown>, ok?: (d: Record<string, unknown>) => void) {
    setBusy(name);
    try {
      const res = await fetch("/api/hotel/integrations/locks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...payload }),
      });
      const d = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        toastError("Door locks", String(d.error ?? "That did not work."));
      } else {
        ok?.(d);
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  const conn = state?.connection;
  const isTtlock = choice === "ttlock";

  return (
    <HmsCard
      id="smart-lock-settings"
      title="Door locks"
      description="Connect your door lock brand so door codes are made for each stay, cancelled at check-out, and staff can open a door remotely."
      icon={KeyRound}
      meaning="rooms"
      actions={
        <SettingsSectionInfo
          title="Door locks"
          text="One-time setup connecting XYVOO to your door lock brand. Choose the brand, sign in to its account, then match each room to its lock. Door codes are made when staff issue or reissue a key and cancelled at check-out."
        />
      }
    >
      <div className="max-w-2xl space-y-5">
        {conn?.fromOldSetting ? (
          <HmsWarning title="Using your earlier lock setting">Choose and save a lock system below to move to the new setup.</HmsWarning>
        ) : null}

        <HmsField id="smart-lock-provider" label="Lock brand">
          <select id="smart-lock-provider" className={hmsInput} value={choice} onChange={(e) => setChoice(e.target.value)}>
            {(state?.providers ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </HmsField>
        <p className="text-sm text-slate-600">{state?.providers.find((p) => p.id === choice)?.needs}</p>
        <p className="text-sm text-slate-500">Salto and ASSA ABLOY VingCard can be added once their partner access is arranged; they will appear in this list.</p>

        {isTtlock ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            {!state?.serverReady.ttlock ? (
              <HmsWarning title="TTLock is not switched on for this server">XYVOO needs its TTLock developer keys before a hotel can sign in. Ask XYVOO support.</HmsWarning>
            ) : null}
            <p className="text-sm text-slate-700">
              {conn?.provider === "ttlock" && conn.signedIn ? "Signed in to TTLock. Sign in again only to switch accounts." : "Sign in with the TTLock account that owns your locks. Your password is used once and never stored."}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <HmsField id="ttlock-user" label="TTLock username">
                <input id="ttlock-user" className={hmsInput} autoComplete="off" value={username} onChange={(e) => setUsername(e.target.value)} />
              </HmsField>
              <HmsField id="ttlock-pass" label="TTLock password">
                <input id="ttlock-pass" className={hmsInput} type="password" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} />
              </HmsField>
            </div>
            <label className="flex items-start gap-2 text-sm text-slate-700">
              <input type="checkbox" className="mt-1" checked={gateway} onChange={(e) => setGateway(e.target.checked)} />
              <span>I have a TTLock gateway. Codes are set on the lock straight away and a lock can be opened remotely. Without one, a guest must touch the lock keypad once before the code works.</span>
            </label>
            <button
              type="button"
              className={hmsButton.primary}
              disabled={busy !== null || !username || !password}
              onClick={() =>
                act("connect", { action: "connect_ttlock", username, password, hasGateway: gateway }, (d) => {
                  setPassword("");
                  toastSuccess("TTLock connected", d.lockCount != null ? `${d.lockCount} lock(s) found.` : String(d.warning ?? ""));
                })
              }
            >
              {busy === "connect" ? "Signing in…" : "Sign in to TTLock"}
            </button>
            {conn?.provider === "ttlock" && conn.signedIn && gateway !== conn.hasGateway ? (
              <button type="button" className={hmsButton.secondary} disabled={busy !== null} onClick={() => act("gw", { action: "set_gateway", hasGateway: gateway }, () => toastSuccess("Saved"))}>
                Save gateway choice
              </button>
            ) : null}
          </div>
        ) : null}

        {choice === "http_webhook" ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <HmsField id="smart-lock-api-url" label="Lock server address">
              <input id="smart-lock-api-url" className={hmsInput} placeholder="https://" value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} />
            </HmsField>
            <HmsField id="smart-lock-api-key" label="Key" optional>
              <input id="smart-lock-api-key" className={hmsInput} type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
            </HmsField>
          </div>
        ) : null}

        {!isTtlock ? (
          <button
            type="button"
            className={hmsButton.primary}
            disabled={busy !== null}
            onClick={() => act("choose", { action: "choose", provider: choice, apiBaseUrl, apiKey: apiKey || undefined }, () => toastSuccess("Door lock setting saved"))}
          >
            {busy === "choose" ? "Saving…" : "Save lock setting"}
          </button>
        ) : null}

        {conn && conn.provider !== "audit_only" ? (
          <div className="space-y-3 border-t border-slate-200 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className={hmsButton.secondary} disabled={busy !== null} onClick={() => act("test", { action: "test" }, (d) => toastSuccess("Connection works", `${d.lockCount} lock(s) found.`))}>
                {busy === "test" ? "Testing…" : "Test connection"}
              </button>
              <button type="button" className={hmsButton.secondary} disabled={busy !== null} onClick={() => act("locks", { action: "list_locks" }, (d) => setLocks(d.locks as ProviderLock[]))}>
                Load my locks
              </button>
              <button type="button" className={hmsButton.secondary} disabled={busy !== null} onClick={() => act("battery", { action: "refresh_batteries" }, (d) => toastInfo("Batteries checked", `${d.updated} lock(s) updated.`))}>
                Check batteries
              </button>
            </div>
            {conn.lastError ? <p role="alert" className="text-sm text-red-700">Last problem: {conn.lastError}</p> : conn.lastTestedAt ? <p className="text-sm text-slate-600">Last tested {new Date(conn.lastTestedAt).toLocaleString()}.</p> : null}

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Rooms and their locks</caption>
                <thead className="text-slate-600">
                  <tr>
                    <th scope="col" className="py-2 pr-3 font-medium">Room</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Lock</th>
                    <th scope="col" className="py-2 pr-3 font-medium">Battery</th>
                    <th scope="col" className="py-2 font-medium"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {(state?.rooms ?? []).map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <th scope="row" className="py-2 pr-3 font-medium text-slate-900">{r.code}</th>
                      <td className="py-2 pr-3">
                        {locks ? (
                          <select
                            aria-label={`Lock for room ${r.code}`}
                            className={hmsInput}
                            value={r.lockId ?? ""}
                            disabled={busy !== null}
                            onChange={(e) => act("match", { action: "match", roomUnitId: r.id, externalLockId: e.target.value || null })}
                          >
                            <option value="">Not matched</option>
                            {locks.map((l) => (
                              <option key={l.externalLockId} value={l.externalLockId}>{l.label}</option>
                            ))}
                            {r.lockId && !locks.some((l) => l.externalLockId === r.lockId) ? <option value={r.lockId}>{r.lockLabel ?? r.lockId}</option> : null}
                          </select>
                        ) : (
                          <span className="text-slate-700">{r.lockId ? (r.lockLabel ?? r.lockId) : "Not matched"}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        {r.battery === null ? <span className="text-slate-500">Unknown</span> : <span className={r.battery <= (state?.lowBatteryPercent ?? 20) ? "font-medium text-red-700" : "text-slate-700"}>{r.battery}%{r.battery <= (state?.lowBatteryPercent ?? 20) ? " (low)" : ""}</span>}
                      </td>
                      <td className="py-2 text-right">
                        {r.lockId ? (
                          <button type="button" className={hmsButton.small} disabled={busy !== null} onClick={() => act("unlock", { action: "unlock", roomUnitId: r.id }, () => toastSuccess(`Room ${r.code} unlock sent`))}>
                            Test unlock
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {locks === null ? <p className="mt-2 text-sm text-slate-500">Choose “Load my locks” to match rooms to locks.</p> : null}
            </div>
          </div>
        ) : null}

        {state && state.events.length > 0 ? (
          <div className="border-t border-slate-200 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">Recent door lock activity</h3>
            <ul className="mt-2 space-y-1 text-sm">
              {state.events.map((e) => (
                <li key={e.id} className={e.ok ? "text-slate-700" : "text-red-700"}>
                  {new Date(e.createdAt).toLocaleString()} · {ACTION_WORDS[e.action] ?? e.action} · {e.ok ? "worked" : `failed: ${e.error ?? "unknown"}`}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </HmsCard>
  );
}
