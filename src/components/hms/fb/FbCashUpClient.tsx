"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, Loader2, Printer, Vault } from "lucide-react";
import { varianceLabel } from "@/lib/hms/fb-cashup-rules";
import type { FbCashSession } from "@/lib/hms/fb-cashup";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { cashUpReportUrl, openPrint } from "@/lib/hms/fb-print-links";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { ManagerPinField } from "@/components/hms/fb/FbReasonFields";
import { HmsAlert, HmsField, HmsPageHeader, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { cn } from "@/lib/utils";

type CashUpData = {
  sessions: FbCashSession[];
  staff: { userId: string; name: string }[];
  /** What each open till should hold now (managers only; staff count blind). */
  expected: Record<string, number>;
  isManager: boolean;
};

type Closing = {
  id: string;
  counted: string;
  notes: string;
  reason: string;
  pin: string;
  needsReason: boolean;
  needsManager: boolean;
};

const POSTING = "posting";

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

async function fetchCashUp(slug: string): Promise<{ data: CashUpData } | { error: string }> {
  try {
    const res = await fetch(`/api/hotel/fb/cash-up?slug=${encodeURIComponent(slug)}`);
    const json = await res.json();
    return res.ok ? { data: json } : { error: json.error ?? "Could not load the tills." };
  } catch {
    return { error: "Could not load the tills. Check your connection." };
  }
}

/** Open a till with a float, count it blind at the end of the shift, see the difference and the shift report. */
export function FbCashUpClient({
  slug,
  currency,
  outlets,
}: {
  slug: string;
  currency: string;
  outlets: { id: string; name: string }[];
}) {
  const [data, setData] = useState<CashUpData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const [floats, setFloats] = useState<Record<string, string>>({});
  const [closing, setClosing] = useState<Closing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const money = (n: number) => formatPricingAmount(n, currency);

  useEffect(() => {
    let live = true;
    fetchCashUp(slug).then((result) => {
      if (!live) return;
      if ("error" in result) {
        setLoadError(result.error);
        return;
      }
      setData(result.data);
      setLoadError("");
    });
    return () => {
      live = false;
    };
  }, [slug, version]);

  const nameOf = useMemo(() => {
    const names = new Map((data?.staff ?? []).map((s) => [s.userId, s.name]));
    return (id: string | null) => (id ? (names.get(id) ?? "Former staff") : "");
  }, [data?.staff]);

  const openByOutlet = new Map((data?.sessions ?? []).filter((s) => s.status === "open").map((s) => [s.outletId, s]));
  const closed = (data?.sessions ?? []).filter((s) => s.status === "closed");

  const post = async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/hotel/fb/cash-up", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, ...payload }),
    });
    return { ok: res.ok, json: await res.json().catch(() => ({})) };
  };

  const openTill = async (outletId: string, outletName: string) => {
    const float = Number(floats[outletId] ?? "0");
    if (!Number.isFinite(float) || float < 0) {
      toastError("Check the float", "Enter the cash put in the till, or 0.");
      return;
    }
    setBusy(`open:${outletId}`);
    try {
      const { ok, json } = await post({ action: "open", outletId, openingFloat: float });
      if (!ok) {
        toastError("Could not open the till", json.error ?? "Try again.");
        return;
      }
      toastSuccess(`${outletName} till open`, `Float ${money(float)}. Cash and card payments now count towards it.`);
      setFloats((f) => ({ ...f, [outletId]: "" }));
      reload();
    } catch {
      toastError("Could not open the till", "Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const closeTill = async () => {
    if (!closing) return;
    const counted = Number(closing.counted);
    if (closing.counted.trim() === "" || !Number.isFinite(counted) || counted < 0) {
      setError("Enter the cash counted in the till.");
      return;
    }
    setBusy(`close:${closing.id}`);
    setError("");
    try {
      const { ok, json } = await post({
        action: "close",
        id: closing.id,
        counted,
        notes: closing.notes.trim() || null,
        varianceReason: closing.reason.trim() || null,
        managerPin: closing.pin || undefined,
      });
      if (!ok) {
        setClosing({
          ...closing,
          needsReason: closing.needsReason || Boolean(json.needsReason),
          needsManager: closing.needsManager || Boolean(json.needsManager),
        });
        setError(json.error ?? "Could not close the till.");
        return;
      }
      const s = json.session as FbCashSession;
      toastSuccess("Till closed", `${varianceLabel(s.variance ?? 0, money)} · expected ${money(s.expectedCash ?? 0)}`);
      if (json.postingError) toastError("Closed, but not booked to the accounts", json.postingError);
      setClosing(null);
      reload();
    } catch {
      toastError("Could not close the till", "Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  };

  const retryPosting = async (s: FbCashSession) => {
    setBusy(`post:${s.id}`);
    try {
      const { ok, json } = await post({ action: "post", id: s.id });
      if (!ok) {
        toastError("Not booked", json.error ?? "Try again.");
      } else {
        toastSuccess("Booked to the accounts");
      }
      reload();
    } finally {
      setBusy(null);
    }
  };

  const bookedCell = (s: FbCashSession) => {
    if (s.journalEntryId) return <span className="text-emerald-800">Booked</span>;
    if (s.postingError === POSTING) return <span className="text-slate-600">Booking…</span>;
    if (s.postingError) {
      return (
        <span className="flex flex-col gap-1">
          <span className="text-red-700">Not booked: {s.postingError}</span>
          {data?.isManager ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void retryPosting(s)}
              className={cn(hmsButton.small, "self-start")}
            >
              {busy === `post:${s.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Try again
            </button>
          ) : null}
        </span>
      );
    }
    return <span className="text-slate-600">Nothing to book</span>;
  };

  return (
    <div className="w-full space-y-4 px-4 py-6 sm:px-6">
      <HmsPageHeader
        eyebrow="Restaurant & bar"
        meaning="food"
        title="Cash-up"
        description="Open each till with a float. At the end of the shift, count the cash and close it: the difference, tips and shift report are worked out for you, and tips and any cash over or short are booked to the accounts."
      />

      {loadError ? <HmsAlert message={loadError} /> : null}
      {!data && !loadError ? (
        <p className="flex items-center gap-2 text-sm text-slate-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading tills…
        </p>
      ) : null}

      {data ? (
        <section aria-labelledby="fb-cashup-tills" className="grid gap-4 md:grid-cols-2">
          <h2 id="fb-cashup-tills" className="sr-only">
            Tills
          </h2>
          {outlets.map((outlet) => {
            const s = openByOutlet.get(outlet.id);
            const isClosing = s && closing?.id === s.id;
            return (
              <article key={outlet.id} className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-heading text-base font-semibold text-slate-900">
                    <Vault className="h-5 w-5 text-slate-600" aria-hidden />
                    {outlet.name}
                  </h3>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                      s ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : "bg-slate-100 text-slate-700",
                    )}
                  >
                    {s ? "Till open" : "Till closed"}
                  </span>
                </div>

                {s ? (
                  <>
                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <dt className="text-slate-600">Opened</dt>
                      <dd className="text-slate-900">
                        {when(s.openedAt)}
                        {s.openedBy ? ` by ${nameOf(s.openedBy)}` : ""}
                      </dd>
                      <dt className="text-slate-600">Float</dt>
                      <dd className="tabular-nums text-slate-900">{money(s.openingFloat)}</dd>
                      {data.isManager && data.expected[s.id] != null ? (
                        <>
                          <dt className="text-slate-600">Should hold now</dt>
                          <dd className="tabular-nums font-semibold text-slate-900">
                            {money(data.expected[s.id])}
                            <span className="block text-xs font-normal text-slate-600">Managers only; staff count blind.</span>
                          </dd>
                        </>
                      ) : null}
                    </dl>

                    {isClosing && closing ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void closeTill();
                        }}
                        className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                        aria-label={`Close the ${outlet.name} till`}
                      >
                        <HmsField id={`fb-cashup-count-${s.id}`} label="Cash counted in the till" hint="Count everything in the drawer, float included.">
                          <input
                            id={`fb-cashup-count-${s.id}`}
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="0.01"
                            value={closing.counted}
                            disabled={busy !== null}
                            onChange={(e) => {
                              setClosing({ ...closing, counted: e.target.value });
                              setError("");
                            }}
                            aria-describedby={`fb-cashup-count-${s.id}-hint`}
                            className={cn(hmsInput, "max-w-48")}
                          />
                        </HmsField>
                        {closing.needsReason ? (
                          <HmsField id={`fb-cashup-reason-${s.id}`} label="Why is the count different?">
                            <input
                              id={`fb-cashup-reason-${s.id}`}
                              value={closing.reason}
                              maxLength={300}
                              disabled={busy !== null}
                              placeholder="e.g. Gave change from my own pocket"
                              onChange={(e) => setClosing({ ...closing, reason: e.target.value })}
                              className={hmsInput}
                            />
                          </HmsField>
                        ) : null}
                        {closing.needsManager ? (
                          <ManagerPinField
                            idPrefix={`fb-cashup-${s.id}`}
                            value={closing.pin}
                            disabled={busy !== null}
                            onChange={(pin) => setClosing({ ...closing, pin })}
                          />
                        ) : null}
                        <HmsField id={`fb-cashup-notes-${s.id}`} label="Notes" optional>
                          <input
                            id={`fb-cashup-notes-${s.id}`}
                            value={closing.notes}
                            maxLength={500}
                            disabled={busy !== null}
                            onChange={(e) => setClosing({ ...closing, notes: e.target.value })}
                            className={hmsInput}
                          />
                        </HmsField>
                        <HmsAlert message={error} />
                        <div className="flex flex-wrap gap-2">
                          <button type="submit" disabled={busy !== null} className={hmsButton.primary}>
                            {busy === `close:${s.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                            Close till
                          </button>
                          <button type="button" disabled={busy !== null} onClick={() => setClosing(null)} className={hmsButton.secondary}>
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => {
                            setError("");
                            setClosing({ id: s.id, counted: "", notes: "", reason: "", pin: "", needsReason: false, needsManager: false });
                          }}
                          className={hmsButton.primary}
                        >
                          <Calculator className="h-4 w-4" aria-hidden />
                          Count and close
                        </button>
                        {data.isManager ? (
                          <button type="button" onClick={() => openPrint(cashUpReportUrl(slug, s.id))} className={hmsButton.secondary}>
                            <Printer className="h-4 w-4 text-slate-600" aria-hidden />
                            Shift report so far
                          </button>
                        ) : null}
                      </div>
                    )}
                  </>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void openTill(outlet.id, outlet.name);
                    }}
                    className="mt-3 flex flex-wrap items-end gap-2"
                  >
                    <HmsField id={`fb-cashup-float-${outlet.id}`} label="Float (cash put in the till)">
                      <input
                        id={`fb-cashup-float-${outlet.id}`}
                        type="number"
                        inputMode="decimal"
                        min={0}
                        step="0.01"
                        placeholder="0"
                        value={floats[outlet.id] ?? ""}
                        disabled={busy !== null}
                        onChange={(e) => setFloats((f) => ({ ...f, [outlet.id]: e.target.value }))}
                        className={cn(hmsInput, "max-w-40")}
                      />
                    </HmsField>
                    <button type="submit" disabled={busy !== null} className={hmsButton.primary}>
                      {busy === `open:${outlet.id}` ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                      Open till
                    </button>
                  </form>
                )}
              </article>
            );
          })}
        </section>
      ) : null}

      {data && closed.length ? (
        <section aria-labelledby="fb-cashup-history" className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm">
          <h2 id="fb-cashup-history" className="font-heading text-base font-semibold text-slate-900">
            Recent cash-ups
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-600">
                  <th scope="col" className="py-2 pr-3 font-medium">Till</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Closed</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Expected</th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">Counted</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Difference</th>
                  <th scope="col" className="py-2 pr-3 font-medium">Accounts</th>
                  <th scope="col" className="py-2"><span className="sr-only">Report</span></th>
                </tr>
              </thead>
              <tbody>
                {closed.map((s) => (
                  <tr key={s.id} className="border-b border-slate-100 align-top last:border-0">
                    <th scope="row" className="py-2 pr-3 text-left font-medium text-slate-900">
                      {s.outletName}
                      <span className="block text-xs font-normal text-slate-600">
                        {when(s.openedAt)} to {when(s.closedAt)}
                      </span>
                    </th>
                    <td className="py-2 pr-3 text-slate-700">{nameOf(s.closedBy)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(s.expectedCash ?? 0)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{money(s.countedCash ?? 0)}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={cn(
                          "font-medium",
                          (s.variance ?? 0) === 0 ? "text-emerald-800" : (s.variance ?? 0) < 0 ? "text-red-700" : "text-amber-800",
                        )}
                      >
                        {varianceLabel(s.variance ?? 0, money)}
                      </span>
                      {s.varianceReason ? <span className="block text-xs text-slate-600">{s.varianceReason}</span> : null}
                      {s.approvedByManager && (s.variance ?? 0) !== 0 ? (
                        <span className="block text-xs text-slate-600">Approved by a manager</span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3">{bookedCell(s)}</td>
                    <td className="py-2 text-right">
                      <button type="button" onClick={() => openPrint(cashUpReportUrl(slug, s.id))} className={hmsButton.small}>
                        <Printer className="h-4 w-4 text-slate-600" aria-hidden />
                        Report<span className="sr-only"> for {s.outletName}, closed {when(s.closedAt)}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
