"use client";

import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { HmsAlert, HmsField, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { formatDateTime } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import { KEY_TYPE_LABELS, KEY_TYPES, type KeyType, type ReservationKey } from "@/lib/hms/reservation-keys";

export function ArrivalKeys({
  slug,
  reservationId,
  canIssue,
}: {
  slug: string;
  reservationId: string;
  /** The guest is checked in and the desk may issue keys. */
  canIssue: boolean;
}) {
  const [keys, setKeys] = useState<ReservationKey[]>([]);
  const [keyType, setKeyType] = useState<KeyType>("card");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const url = `/api/hotel/frontdesk/arrivals/${reservationId}/keys`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${url}?slug=${encodeURIComponent(slug)}`, { cache: "no-store" });
      const json = await res.json();
      setKeys(json.keys ?? []);
    } catch {
      setKeys([]);
    }
  }, [url, slug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function call(method: "POST" | "PATCH", body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = json.error ?? "Something went wrong.";
        setError(msg);
        toastError("Key not saved", msg);
        return false;
      }
      await load();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const live = keys.filter((k) => k.status === "issued");
  const past = keys.filter((k) => k.status === "revoked");

  return (
    <div className="space-y-4">
      {keys.length === 0 ? (
        <p className="text-sm text-slate-600">No key has been issued for this stay yet.</p>
      ) : (
        <ul className="space-y-2">
          {[...live, ...past].map((k) => (
            <li key={k.id} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-sm font-medium text-slate-900">
                  <KeyRound className="h-4 w-4 text-slate-500" aria-hidden />
                  {KEY_TYPE_LABELS[k.keyType]}
                  {k.label ? <span className="font-normal text-slate-600">{k.label}</span> : null}
                </span>
                <HmsPill tone={k.status === "issued" ? "green" : "slate"}>{k.status === "issued" ? "Live" : "Revoked"}</HmsPill>
              </div>
              <p className="mt-1 text-xs text-slate-600">
                Issued {formatDateTime(k.issuedAt)}
                {k.revokedAt ? ` · Revoked ${formatDateTime(k.revokedAt)}${k.revokeReason ? `: ${k.revokeReason}` : ""}` : ""}
              </p>
              {k.status === "issued" && canIssue ? (
                revoking === k.id ? (
                  <form
                    className="mt-3 flex flex-wrap items-end gap-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (await call("PATCH", { keyId: k.id, reason: reason.trim() })) {
                        toastSuccess("Key revoked");
                        setRevoking(null);
                        setReason("");
                      }
                    }}
                  >
                    <div className="min-w-[12rem] flex-1">
                      <HmsField id={`revoke-${k.id}`} label="Why revoke it?">
                        <input
                          id={`revoke-${k.id}`}
                          className={hmsInput}
                          maxLength={200}
                          placeholder="For example, guest lost it"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          autoFocus
                        />
                      </HmsField>
                    </div>
                    <button type="submit" className={hmsButton.danger} disabled={busy || !reason.trim()}>
                      Revoke key
                    </button>
                    <button type="button" className={hmsButton.secondary} onClick={() => setRevoking(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button
                    type="button"
                    className={cn(hmsButton.secondary, "mt-3")}
                    onClick={() => {
                      setRevoking(k.id);
                      setReason("");
                    }}
                  >
                    Revoke
                  </button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {canIssue ? (
        <form
          className="grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-[auto_1fr_auto] sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await call("POST", { keyType, label: label.trim() || undefined })) {
              toastSuccess("Key recorded");
              setLabel("");
            }
          }}
        >
          <HmsField id="key-type" label="Key">
            <select
              id="key-type"
              className={cn(hmsInput, "cursor-pointer")}
              value={keyType}
              onChange={(e) => setKeyType(e.target.value as KeyType)}
            >
              {KEY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {KEY_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </HmsField>
          <HmsField id="key-label" label="Card number or note" hint="Optional.">
            <input
              id="key-label"
              aria-describedby="key-label-hint"
              className={hmsInput}
              maxLength={40}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </HmsField>
          <button type="submit" className={hmsButton.primary} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Issue key
          </button>
        </form>
      ) : (
        <p className="text-xs text-slate-600">Keys can be issued once the guest is checked in.</p>
      )}
      {error ? <HmsAlert message={error} /> : null}
    </div>
  );
}
