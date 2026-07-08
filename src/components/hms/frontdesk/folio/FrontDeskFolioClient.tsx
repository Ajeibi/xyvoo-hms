"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { FolioLineRow } from "@/lib/hms/folio";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { PAYMENT_STATUS_LABEL } from "@/components/hms/frontdesk/board/payment-styles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, toastSuccess } from "@/lib/app-toast";

type FolioPayload = {
  reservation: {
    id: string;
    confirmationCode: string;
    folioNumber: string;
    status: string;
    settlementMethod: string;
    billToAccount: string | null;
    poNumber: string | null;
    folioSplitNotes: string | null;
    commissionPlan: string | null;
    commissionValue: number | null;
  };
  folio: {
    lines: FolioLineRow[];
    charges: number;
    credits: number;
    balance: number;
    displayStatus: string;
    guestLegBalance: number;
    companyLegBalance: number;
  };
  settings: { allowCheckoutWithBalance: boolean; hasManagerPin: boolean };
};

type SearchHit = {
  reservationId: string;
  confirmationCode: string;
  folioNumber: string;
  guestName: string;
  roomCode: string | null;
  status: string;
};

export function FrontDeskFolioClient({ slug, currency }: { slug: string; currency: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialId = searchParams.get("reservationId");

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [reservationId, setReservationId] = useState(initialId ?? "");
  const [payload, setPayload] = useState<FolioPayload | null>(null);
  const [legFilter, setLegFilter] = useState<"all" | "guest" | "company">("all");
  const [tab, setTab] = useState<"folio" | "cash-float">("folio");
  const [cashSession, setCashSession] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);

  const loadFolio = useCallback(
    async (id: string) => {
      if (!id) return;
      setLoading(true);
      try {
        const res = await fetch(
          `/api/hotel/folio?slug=${encodeURIComponent(slug)}&reservationId=${encodeURIComponent(id)}`,
        );
        if (res.ok) {
          const data = (await res.json()) as FolioPayload;
          setPayload(data);
          setReservationId(id);
        }
      } finally {
        setLoading(false);
      }
    },
    [slug],
  );

  const loadCashFloat = useCallback(async () => {
    const res = await fetch(`/api/hotel/folio/cash-float?slug=${encodeURIComponent(slug)}`);
    if (res.ok) {
      const data = (await res.json()) as { session: Record<string, unknown> | null };
      setCashSession(data.session);
    }
  }, [slug]);

  useEffect(() => {
    if (initialId) void loadFolio(initialId);
    void loadCashFloat();
  }, [initialId, loadFolio, loadCashFloat, slug]);

  const search = async () => {
    if (!query.trim()) return;
    const res = await fetch(
      `/api/hotel/folio/search?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(query.trim())}`,
    );
    if (res.ok) {
      const data = (await res.json()) as { results: SearchHit[] };
      setHits(data.results);
    }
  };

  const postCharge = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reservationId) return;
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/hotel/folio/charges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        reservationId,
        amount: Number(fd.get("amount")),
        description: fd.get("description"),
        department: fd.get("department") || undefined,
        splitLeg: fd.get("splitLeg") || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not post charge", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Charge posted");
    e.currentTarget.reset();
    void loadFolio(reservationId);
    router.refresh();
  };

  const postPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reservationId) return;
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/hotel/folio/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        reservationId,
        amount: Number(fd.get("amount")),
        method: fd.get("method"),
        reference: fd.get("reference") || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not post payment", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Payment posted");
    e.currentTarget.reset();
    void loadFolio(reservationId);
    router.refresh();
  };

  const lines =
    payload?.folio.lines.filter((l) => {
      if (legFilter === "all") return true;
      return l.split_leg === legFilter;
    }) ?? [];

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Front desk</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Financial & folio</h1>
        </div>
        <Link href={`/hms/${slug}/frontdesk`} className="text-sm text-blue-600 hover:underline">
          ← Operations board
        </Link>
      </div>

      <div className="mt-6 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
        <Button
          type="button"
          variant={tab === "folio" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTab("folio")}
        >
          Folio
        </Button>
        <Button
          type="button"
          variant={tab === "cash-float" ? "default" : "ghost"}
          size="sm"
          onClick={() => setTab("cash-float")}
        >
          Cash float
        </Button>
      </div>

      {tab === "cash-float" ? (
        <CashFloatPanel slug={slug} session={cashSession} onRefresh={loadCashFloat} />
      ) : (
        <>
          <div className="mt-6 flex flex-wrap gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Folio #, confirmation, guest…"
              className="max-w-md"
            />
            <Button type="button" onClick={() => void search()}>
              Search
            </Button>
          </div>
          {hits.length > 0 ? (
            <ul className="mt-3 space-y-1 rounded-xl border border-slate-200 bg-white p-2">
              {hits.map((h) => (
                <li key={h.reservationId}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                    onClick={() => void loadFolio(h.reservationId)}
                  >
                    <span className="font-medium">{h.guestName}</span>
                    <span className="text-slate-500">
                      {" "}
                      · {h.folioNumber} · {h.confirmationCode}
                      {h.roomCode ? ` · Room ${h.roomCode}` : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {payload ? (
            <div className="mt-8 space-y-6">
              <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Folio {payload.reservation.folioNumber}</h2>
                    <p className="text-sm text-slate-500">
                      {payload.reservation.confirmationCode} · {payload.reservation.status}
                    </p>
                    {payload.reservation.commissionPlan ? (
                      <p className="mt-1 text-xs text-violet-700">
                        Commission: {payload.reservation.commissionPlan} ·{" "}
                        {formatPricingAmount(Number(payload.reservation.commissionValue ?? 0), currency)}
                      </p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-500">Balance due</p>
                    <p className="text-2xl font-bold tabular-nums text-slate-900">
                      {formatPricingAmount(payload.folio.balance, currency)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {PAYMENT_STATUS_LABEL[payload.folio.displayStatus as keyof typeof PAYMENT_STATUS_LABEL] ??
                        payload.folio.displayStatus}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  {(["all", "guest", "company"] as const).map((leg) => (
                    <Button
                      key={leg}
                      type="button"
                      size="sm"
                      variant={legFilter === leg ? "default" : "outline"}
                      onClick={() => setLegFilter(leg)}
                    >
                      {leg === "all" ? "All" : leg === "guest" ? "Guest" : "Company"}
                    </Button>
                  ))}
                </div>
                <FolioLineTable
                  lines={lines}
                  currency={currency}
                  slug={slug}
                  onVoid={() => void loadFolio(reservationId)}
                />
              </section>

              <CorporateBillingForm slug={slug} reservationId={reservationId} payload={payload} onSaved={() => void loadFolio(reservationId)} />

              <div className="grid gap-6 lg:grid-cols-2">
                <form onSubmit={postCharge} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                  <h3 className="font-semibold text-slate-900">Post charge</h3>
                  <Input name="description" placeholder="Description" required />
                  <Input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount" required />
                  <Input name="department" placeholder="Department (optional)" />
                  <select name="splitLeg" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm">
                    <option value="guest">Guest leg</option>
                    <option value="company">Company leg</option>
                  </select>
                  <Button type="submit">Post charge</Button>
                </form>
                <div className="space-y-4">
                  <form onSubmit={postPayment} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
                    <h3 className="font-semibold text-slate-900">Post payment</h3>
                    <Input name="amount" type="number" step="0.01" min="0.01" placeholder="Amount" required />
                    <select name="method" className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm" required>
                      <option value="cash">Cash</option>
                      <option value="card">Card (manual reference)</option>
                      <option value="pos">POS terminal</option>
                      <option value="split">Split</option>
                      <option value="direct_bill">Direct bill</option>
                    </select>
                    <Input name="reference" placeholder="Receipt / reference (optional)" />
                    <Button type="submit">Post payment</Button>
                  </form>
                </div>
              </div>
            </div>
          ) : loading ? (
            <p className="mt-8 text-sm text-slate-500">Loading folio…</p>
          ) : (
            <p className="mt-8 text-sm text-slate-500">Search for a stay to open its folio.</p>
          )}
        </>
      )}
    </div>
  );
}

function FolioLineTable({
  lines,
  currency,
  slug,
  onVoid,
}: {
  lines: FolioLineRow[];
  currency: string;
  slug: string;
  onVoid: () => void;
}) {
  const voidLine = async (lineId: string) => {
    const reason = prompt("Reason for void:");
    if (!reason) return;
    const pin = prompt("Manager PIN (if required):");
    const res = await fetch("/api/hotel/folio/lines/void", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, lineId, reason, managerPin: pin || undefined }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not void line", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Charge voided");
    onVoid();
  };

  return (
    <table className="mt-4 w-full text-sm">
      <thead className="text-left text-xs uppercase text-slate-500">
        <tr>
          <th className="py-2">Date</th>
          <th>Description</th>
          <th>Leg</th>
          <th className="text-right">Amount</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {lines.length === 0 ? (
          <tr>
            <td colSpan={5} className="py-6 text-center text-slate-500">
              No lines yet.
            </td>
          </tr>
        ) : (
          lines.map((l) => (
            <tr key={l.id} className={l.voided_at ? "opacity-50 line-through" : ""}>
              <td className="py-2 text-slate-600">{new Date(l.created_at).toLocaleString()}</td>
              <td>{l.description ?? l.kind}</td>
              <td className="capitalize text-slate-500">{l.split_leg}</td>
              <td className="text-right font-medium tabular-nums">
                {formatPricingAmount(l.amount, currency)}
              </td>
              <td className="text-right">
                {!l.voided_at && l.kind === "charge" ? (
                  <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => void voidLine(l.id)}>
                    Void
                  </button>
                ) : null}
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function CorporateBillingForm({
  slug,
  reservationId,
  payload,
  onSaved,
}: {
  slug: string;
  reservationId: string;
  payload: FolioPayload;
  onSaved: () => void;
}) {
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/hotel/folio/reservation", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        reservationId,
        billToAccount: fd.get("billToAccount") || null,
        poNumber: fd.get("poNumber") || null,
        folioSplitNotes: fd.get("folioSplitNotes") || null,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not save billing details", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Billing details saved");
    onSaved();
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
      <h3 className="font-semibold text-slate-900">Corporate billing</h3>
      <Input name="billToAccount" defaultValue={payload.reservation.billToAccount ?? ""} placeholder="Bill to account" />
      <Input name="poNumber" defaultValue={payload.reservation.poNumber ?? ""} placeholder="PO number" />
      <Input name="folioSplitNotes" defaultValue={payload.reservation.folioSplitNotes ?? ""} placeholder="Split folio notes" />
      <Button type="submit" variant="outline">
        Save billing details
      </Button>
    </form>
  );
}

function CashFloatPanel({
  slug,
  session,
  onRefresh,
}: {
  slug: string;
  session: Record<string, unknown> | null;
  onRefresh: () => void;
}) {
  const open = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/hotel/folio/cash-float", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, action: "open", openingBalance: Number(fd.get("openingBalance")) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not open cash float", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Cash float opened");
    onRefresh();
  };

  const close = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/hotel/folio/cash-float", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        action: "close",
        closingBalance: Number(fd.get("closingBalance")),
        notes: fd.get("notes") || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not close cash float", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Cash float closed");
    onRefresh();
  };

  return (
    <section className="mt-6 max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-slate-900">Cash float</h2>
      {session ? (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-slate-600">
            Session open since {new Date(session.opened_at as string).toLocaleString()} · Opening{" "}
            {String(session.opening_balance)}
          </p>
          <form onSubmit={close} className="space-y-3">
            <Input name="closingBalance" type="number" step="0.01" placeholder="Counted closing balance" required />
            <Input name="notes" placeholder="Notes (optional)" />
            <Button type="submit">Close session</Button>
          </form>
        </div>
      ) : (
        <form onSubmit={open} className="mt-4 space-y-3">
          <Input name="openingBalance" type="number" step="0.01" min="0" placeholder="Opening balance" required />
          <Button type="submit">Open session</Button>
        </form>
      )}
    </section>
  );
}
