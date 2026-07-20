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
import { Skeleton } from "@/components/ui/skeleton";

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
  balance?: number;
  lastActivityAt?: string | null;
};

const STATUS_LABEL: Record<string, string> = {
  checked_in: "In-house",
  checked_out: "Checked out",
};

export function FrontDeskFolioClient({ slug, currency }: { slug: string; currency: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialId = searchParams.get("reservationId");
  const initialCode = searchParams.get("code");

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [reservationId, setReservationId] = useState(initialId ?? "");
  const [payload, setPayload] = useState<FolioPayload | null>(null);
  const [legFilter, setLegFilter] = useState<"all" | "guest" | "company">("all");
  const [tab, setTab] = useState<"folio" | "cash-float">("folio");
  const [cashSession, setCashSession] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeList, setActiveList] = useState<SearchHit[]>([]);
  const [activeListLoading, setActiveListLoading] = useState(true);

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

  const loadActiveList = useCallback(async () => {
    setActiveListLoading(true);
    try {
      const res = await fetch(`/api/hotel/folio/active?slug=${encodeURIComponent(slug)}`);
      if (res.ok) {
        const data = (await res.json()) as { results: SearchHit[] };
        setActiveList(data.results);
      }
    } finally {
      setActiveListLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (initialId) {
      void loadFolio(initialId);
    } else if (initialCode) {
      void (async () => {
        const res = await fetch(
          `/api/hotel/folio/search?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(initialCode)}`,
        );
        if (!res.ok) return;
        const data = (await res.json()) as { results: SearchHit[] };
        const match =
          data.results.find((r) => r.confirmationCode === initialCode) ?? data.results[0];
        if (match) void loadFolio(match.reservationId);
      })();
    }
    void loadCashFloat();
    void loadActiveList();
  }, [initialId, initialCode, loadFolio, loadCashFloat, loadActiveList, slug]);

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
    void loadActiveList();
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
    void loadActiveList();
    router.refresh();
  };

  const lines =
    payload?.folio.lines.filter((l) => {
      if (legFilter === "all") return true;
      return l.split_leg === legFilter;
    }) ?? [];

  return (
    <div className="w-full px-6 py-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Front desk</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Financial & folio</h1>
        </div>
        <Link href={`/hms/${slug}/frontdesk`} className="text-sm text-blue-600 hover:underline">
          ← Operations board
        </Link>
      </div>

      <div className="mt-6 flex items-center gap-2">
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

          {query.trim() ? (
            <FolioRowList
              title="Search results"
              rows={hits}
              currency={currency}
              emptyText="No matches. Try a different name, folio #, or confirmation code."
              onSelect={(id) => void loadFolio(id)}
            />
          ) : activeListLoading ? (
            <FolioRowListSkeleton />
          ) : (
            <FolioRowList
              title="In-house & unpaid"
              rows={activeList}
              currency={currency}
              emptyText="No in-house guests or outstanding balances right now."
              onSelect={(id) => void loadFolio(id)}
            />
          )}

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
            <FolioSkeleton />
          ) : null}
        </>
      )}
    </div>
  );
}

const sk = "bg-slate-200";

function FolioSkeleton() {
  return (
    <div className="mt-8 space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className={`h-5 w-48 ${sk}`} />
            <Skeleton className={`h-4 w-56 ${sk}`} />
          </div>
          <div className="space-y-2 text-right">
            <Skeleton className={`ml-auto h-3 w-20 ${sk}`} />
            <Skeleton className={`ml-auto h-7 w-28 ${sk}`} />
            <Skeleton className={`ml-auto h-3 w-24 ${sk}`} />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className={`h-8 w-16 rounded-md ${sk}`} />
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-slate-100">
          <div className="flex gap-8 border-b border-slate-100 bg-slate-50 px-4 py-3">
            {["Date", "Description", "Leg", "Amount"].map((label) => (
              <Skeleton key={label} className={`h-3 w-16 ${sk}`} />
            ))}
          </div>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-8 px-4 py-3">
                <Skeleton className={`h-4 w-28 ${sk}`} />
                <Skeleton className={`h-4 w-48 ${sk}`} />
                <Skeleton className={`h-4 w-12 ${sk}`} />
                <Skeleton className={`ml-auto h-4 w-20 ${sk}`} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
        <Skeleton className={`h-4 w-40 ${sk}`} />
        <Skeleton className={`h-10 w-full rounded-md ${sk}`} />
        <Skeleton className={`h-10 w-full rounded-md ${sk}`} />
        <Skeleton className={`h-10 w-full rounded-md ${sk}`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <Skeleton className={`h-4 w-28 ${sk}`} />
          <Skeleton className={`h-10 w-full rounded-md ${sk}`} />
          <Skeleton className={`h-10 w-full rounded-md ${sk}`} />
          <Skeleton className={`h-10 w-full rounded-md ${sk}`} />
          <Skeleton className={`h-10 w-24 rounded-md ${sk}`} />
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-3">
          <Skeleton className={`h-4 w-32 ${sk}`} />
          <Skeleton className={`h-10 w-full rounded-md ${sk}`} />
          <Skeleton className={`h-10 w-full rounded-md ${sk}`} />
          <Skeleton className={`h-10 w-full rounded-md ${sk}`} />
          <Skeleton className={`h-10 w-24 rounded-md ${sk}`} />
        </div>
      </div>
    </div>
  );
}

const STATUS_BADGE_STYLE: Record<string, string> = {
  checked_in: "bg-blue-50 text-blue-700",
  checked_out: "bg-slate-100 text-slate-600",
};

function FolioRowList({
  title,
  rows,
  currency,
  emptyText,
  onSelect,
}: {
  title: string;
  rows: SearchHit[];
  currency: string;
  emptyText: string;
  onSelect: (reservationId: string) => void;
}) {
  return (
    <div className="mt-4">
      <div className="flex items-center gap-2 px-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{title}</p>
        {rows.length > 0 ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
            {rows.length}
          </span>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
          {emptyText}
        </p>
      ) : (
        <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs font-medium uppercase tracking-wide text-slate-400">
                <th className="py-3 pl-5 pr-4 font-medium">Guest</th>
                <th className="py-3 pr-4 font-medium">Room</th>
                <th className="py-3 pr-4 font-medium">Folio</th>
                <th className="py-3 pr-4 text-right font-medium">Balance</th>
                <th className="py-3 pr-5 text-right font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((h) => (
                <tr
                  key={h.reservationId}
                  className="cursor-pointer transition-colors hover:bg-slate-50"
                  onClick={() => onSelect(h.reservationId)}
                >
                  <td className="py-3 pl-5 pr-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-900">{h.guestName}</p>
                      <p className="truncate text-xs text-slate-500">{h.confirmationCode}</p>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">
                    {h.roomCode ? (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-medium">
                        Room {h.roomCode}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-3 pr-4 font-mono text-xs text-slate-500">{h.folioNumber}</td>
                  <td className="py-3 pr-4 text-right">
                    {h.balance != null ? (
                      <span
                        className={`font-semibold tabular-nums ${
                          h.balance > 0 ? "text-red-600" : "text-emerald-600"
                        }`}
                      >
                        {formatPricingAmount(h.balance, currency)}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3 pr-5 text-right">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                        STATUS_BADGE_STYLE[h.status] ?? "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {STATUS_LABEL[h.status] ?? h.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FolioRowListSkeleton() {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex gap-8 border-b border-slate-100 px-5 py-3">
        {["Guest", "Room", "Folio", "Balance", "Status"].map((label) => (
          <Skeleton key={label} className="h-3 w-14 bg-slate-200" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-4 w-32 bg-slate-200" />
              <Skeleton className="h-3 w-20 bg-slate-200" />
            </div>
            <Skeleton className="ml-auto h-4 w-20 bg-slate-200" />
          </div>
        ))}
      </div>
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
