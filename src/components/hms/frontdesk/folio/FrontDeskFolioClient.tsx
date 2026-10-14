"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { FolioLineRow } from "@/lib/hms/folio";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { PAYMENT_STATUS_LABEL } from "@/components/hms/frontdesk/board/payment-styles";
import { ArrowLeft, Banknote, Building2, Coins, Percent, Plus, Receipt, Search, Wallet } from "lucide-react";
import {
  HmsCard,
  HmsEmptyState,
  HmsField,
  HmsPage,
  HmsPageHeader,
  HmsPill,
  HmsStatStrip,
  HmsStatTile,
  hmsButton,
  hmsInput,
} from "@/components/hms/hms-ui";
import { HmsFilterChips, HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  checked_in: "Staying now",
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
        splitLeg: fd.get("splitLeg") || undefined,
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

  const applyDiscount = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reservationId) return;
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/hotel/folio/discounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        reservationId,
        amount: Number(fd.get("amount")),
        description: fd.get("description"),
        splitLeg: fd.get("splitLeg") || undefined,
        managerPin: fd.get("managerPin") || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not apply discount", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Discount applied");
    e.currentTarget.reset();
    void loadFolio(reservationId);
    void loadActiveList();
    router.refresh();
  };

  const postFxPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!reservationId) return;
    const fd = new FormData(e.currentTarget);
    const originalAmount = Number(fd.get("originalAmount"));
    const fxRate = Number(fd.get("fxRate"));
    const res = await fetch("/api/hotel/folio/fx-payment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        reservationId,
        originalAmount,
        originalCurrency: (fd.get("originalCurrency") as string)?.toUpperCase(),
        fxRate,
        amountLocal: Math.round(originalAmount * fxRate * 100) / 100,
        method: fd.get("method"),
        reference: fd.get("reference") || undefined,
        splitLeg: fd.get("splitLeg") || undefined,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not post FX payment", data.error ?? "Try again.");
      return;
    }
    toastSuccess("FX payment posted");
    e.currentTarget.reset();
    void loadFolio(reservationId);
    void loadActiveList();
    router.refresh();
  };

  const transferCharge = async (lineId: string) => {
    const targetCode = prompt("Confirmation code of the folio to transfer this charge to:");
    if (!targetCode?.trim()) return;
    const searchRes = await fetch(
      `/api/hotel/folio/search?slug=${encodeURIComponent(slug)}&q=${encodeURIComponent(targetCode.trim())}`,
    );
    const searchData = (await searchRes.json().catch(() => ({}))) as { results?: SearchHit[] };
    const target = searchData.results?.find(
      (r) => r.confirmationCode.toLowerCase() === targetCode.trim().toLowerCase(),
    );
    if (!target) {
      toastError("Could not find that folio", "Check the confirmation code and try again.");
      return;
    }
    if (target.reservationId === reservationId) {
      toastError("Could not transfer charge", "Pick a different folio to transfer to.");
      return;
    }
    const res = await fetch("/api/hotel/folio/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, lineId, targetReservationId: target.reservationId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not transfer charge", data.error ?? "Try again.");
      return;
    }
    toastSuccess(`Charge transferred to ${target.confirmationCode}`);
    void loadFolio(reservationId);
    void loadActiveList();
    router.refresh();
  };

  const reassignSplitLeg = async (lineIds: string[], splitLeg: "guest" | "company") => {
    if (!reservationId || lineIds.length === 0) return;
    const res = await fetch("/api/hotel/folio/lines/split-leg", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, reservationId, lineIds, splitLeg }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toastError("Could not move charges", data.error ?? "Try again.");
      return;
    }
    toastSuccess(`Moved ${data.count} line${data.count === 1 ? "" : "s"} to the ${splitLeg} leg`);
    void loadFolio(reservationId);
    router.refresh();
  };

  const lines =
    payload?.folio.lines.filter((l) => {
      if (legFilter === "all") return true;
      return l.split_leg === legFilter;
    }) ?? [];

  return (
    <HmsPage wide>
      <Link
        href={`/hms/${slug}/frontdesk`}
        className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to the front desk
      </Link>
      <HmsPageHeader
        eyebrow="Front desk"
        meaning="money"
        title="Guest bills"
        description="Find a guest's bill (folio), add charges and take payments. The cash float tracks the money in the till."
      />

      <HmsFilterChips
        label="Show"
        meaning="money"
        options={[
          { value: "folio", label: "Guest bills" },
          { value: "cash-float", label: "Cash float" },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "cash-float" ? (
        <CashFloatPanel slug={slug} session={cashSession} onRefresh={loadCashFloat} />
      ) : (
        <>
          <HmsSectionIntro
            id="folio"
            meaning="money"
            art="page"
            title="How guest bills work"
            points={[
              "Each stay has a bill, called a folio. Room charges are added for you; you can add extras, discounts and payments.",
              "A bill can be split: some charges paid by the guest, others billed to their company.",
              "Voiding a charge or giving a discount may need a manager's PIN.",
            ]}
          />

          <form
            role="search"
            className="flex max-w-xl flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void search();
            }}
          >
            <div className="min-w-0 flex-1">
              <label htmlFor="folio-search" className="mb-1 block text-sm font-medium text-slate-800">
                Find a bill
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
                <input
                  id="folio-search"
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Bill number, confirmation code or guest name"
                  className={`${hmsInput} pl-10`}
                />
              </div>
            </div>
            <button type="submit" className={`${hmsButton.primary} ${focusRing}`}>
              Search
            </button>
          </form>

          {query.trim() ? (
            <FolioRowList
              title="Search results"
              description="Select a guest to open their bill."
              rows={hits}
              currency={currency}
              emptyTitle="No bills match"
              emptyText="Try a different guest name, bill number or confirmation code."
              onSelect={(id) => void loadFolio(id)}
            />
          ) : activeListLoading ? (
            <FolioRowListSkeleton />
          ) : (
            <FolioRowList
              title="Staying now or still to pay"
              description="Guests in the hotel, and bills with money still owed. Select one to open it."
              rows={activeList}
              currency={currency}
              emptyTitle="Nothing to settle right now"
              emptyText="No guests are staying and no bills have money owed. Search above to find an older bill."
              onSelect={(id) => void loadFolio(id)}
            />
          )}

          {payload ? (
            <div className="space-y-6">
              <HmsStatStrip label={`Bill ${payload.reservation.folioNumber} in figures`}>
                <HmsStatTile label="Charges" value={formatPricingAmount(payload.folio.charges, currency)} icon={Receipt} meaning="money" hint="Everything added to the bill" />
                <HmsStatTile label="Paid and credited" value={formatPricingAmount(payload.folio.credits, currency)} icon={Banknote} meaning="money" hint="Taken off the bill so far" />
                <HmsStatTile
                  label="Still to pay"
                  value={formatPricingAmount(payload.folio.balance, currency)}
                  icon={Wallet}
                  meaning="money"
                  hint={
                    PAYMENT_STATUS_LABEL[payload.folio.displayStatus as keyof typeof PAYMENT_STATUS_LABEL] ??
                    payload.folio.displayStatus
                  }
                />
                <HmsStatTile
                  label="Guest / company"
                  value={
                    <span className="text-lg">
                      {formatPricingAmount(payload.folio.guestLegBalance, currency)} / {formatPricingAmount(payload.folio.companyLegBalance, currency)}
                    </span>
                  }
                  icon={Building2}
                  meaning="money"
                  hint="What each side still owes"
                />
              </HmsStatStrip>

              <HmsCard
                id="folio-lines"
                icon={Receipt}
                meaning="money"
                title={`Bill ${payload.reservation.folioNumber}`}
                description={
                  <>
                    Booking {payload.reservation.confirmationCode} · {words(payload.reservation.status)}
                    {payload.reservation.commissionPlan ? (
                      <>
                        {" "}
                        · Commission: {payload.reservation.commissionPlan},{" "}
                        {formatPricingAmount(Number(payload.reservation.commissionValue ?? 0), currency)}
                      </>
                    ) : null}
                  </>
                }
              >
                <HmsFilterChips
                  label="Show lines for"
                  meaning="money"
                  options={[
                    { value: "all", label: "Whole bill", count: payload.folio.lines.length },
                    { value: "guest", label: "Guest", count: payload.folio.lines.filter((l) => l.split_leg === "guest").length },
                    { value: "company", label: "Company", count: payload.folio.lines.filter((l) => l.split_leg === "company").length },
                  ]}
                  value={legFilter}
                  onChange={setLegFilter}
                />
                <FolioLineTable
                  lines={lines}
                  currency={currency}
                  slug={slug}
                  onVoid={() => void loadFolio(reservationId)}
                  onTransfer={(lineId) => void transferCharge(lineId)}
                  onReassignSplitLeg={(lineIds, leg) => void reassignSplitLeg(lineIds, leg)}
                />
              </HmsCard>

              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-6">
                  <HmsCard id="folio-charge" icon={Plus} meaning="money" title="Add a charge" description="For extras such as room service, laundry or minibar.">
                    <form onSubmit={postCharge} className="space-y-4">
                      <F id="charge-description" label="What it's for">
                        <input id="charge-description" name="description" required className={hmsInput} />
                      </F>
                      <F id="charge-amount" label={`Amount (${currency})`}>
                        <input id="charge-amount" name="amount" type="number" step="0.01" min="0.01" required className={hmsInput} />
                      </F>
                      <F id="charge-department" label="Department" optional hint="For example: restaurant, spa or laundry.">
                        <input id="charge-department" name="department" aria-describedby="charge-department-hint" className={hmsInput} />
                      </F>
                      <LegSelect id="charge-leg" />
                      <button type="submit" className={`${hmsButton.primary} ${focusRing}`}>
                        Add charge
                      </button>
                    </form>
                  </HmsCard>
                  <HmsCard id="folio-discount" icon={Percent} meaning="money" title="Give a discount">
                    <form onSubmit={applyDiscount} className="space-y-4">
                      <F id="discount-description" label="Reason for the discount">
                        <input id="discount-description" name="description" required className={hmsInput} />
                      </F>
                      <F id="discount-amount" label={`Amount (${currency})`}>
                        <input id="discount-amount" name="amount" type="number" step="0.01" min="0.01" required className={hmsInput} />
                      </F>
                      <LegSelect id="discount-leg" />
                      <F id="discount-pin" label="Manager PIN" optional hint="Needed if you're not a manager or admin.">
                        <input id="discount-pin" name="managerPin" type="password" autoComplete="off" aria-describedby="discount-pin-hint" className={hmsInput} />
                      </F>
                      <button type="submit" className={`${hmsButton.secondary} ${focusRing}`}>
                        Give discount
                      </button>
                    </form>
                  </HmsCard>
                </div>
                <div className="space-y-6">
                  <HmsCard id="folio-payment" icon={Banknote} meaning="money" title="Take a payment">
                    <form onSubmit={postPayment} className="space-y-4">
                      <F id="payment-amount" label={`Amount (${currency})`}>
                        <input id="payment-amount" name="amount" type="number" step="0.01" min="0.01" required className={hmsInput} />
                      </F>
                      <F id="payment-method" label="How they paid">
                        <select id="payment-method" name="method" required className={hmsInput}>
                          <option value="cash">Cash</option>
                          <option value="card">Card (enter the reference)</option>
                          <option value="pos">Card machine</option>
                          <option value="split">Split</option>
                          <option value="direct_bill">Direct bill</option>
                        </select>
                      </F>
                      <LegSelect id="payment-leg" paying />
                      <F id="payment-reference" label="Receipt or reference" optional>
                        <input id="payment-reference" name="reference" className={hmsInput} />
                      </F>
                      <button type="submit" className={`${hmsButton.primary} ${focusRing}`}>
                        Record payment
                      </button>
                    </form>
                  </HmsCard>
                  <HmsCard id="folio-fx-payment" icon={Coins} meaning="money" title="Take a payment in another currency">
                    <form onSubmit={postFxPayment} className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <F id="fx-amount" label="Amount received">
                          <input id="fx-amount" name="originalAmount" type="number" step="0.01" min="0.01" required className={hmsInput} />
                        </F>
                        <F id="fx-currency" label="Currency" hint="Three letters, such as USD.">
                          <input id="fx-currency" name="originalCurrency" maxLength={3} required aria-describedby="fx-currency-hint" className={hmsInput} />
                        </F>
                      </div>
                      <F id="fx-rate" label={`Exchange rate to ${currency}`}>
                        <input id="fx-rate" name="fxRate" type="number" step="0.0001" min="0.0001" required className={hmsInput} />
                      </F>
                      <F id="fx-method" label="How they paid">
                        <select id="fx-method" name="method" required className={hmsInput}>
                          <option value="cash">Cash</option>
                          <option value="card">Card (enter the reference)</option>
                          <option value="split">Split</option>
                          <option value="direct_bill">Direct bill</option>
                        </select>
                      </F>
                      <LegSelect id="fx-leg" paying />
                      <F id="fx-reference" label="Receipt or reference" optional>
                        <input id="fx-reference" name="reference" className={hmsInput} />
                      </F>
                      <button type="submit" className={`${hmsButton.secondary} ${focusRing}`}>
                        Record payment
                      </button>
                    </form>
                  </HmsCard>
                </div>
              </div>

              <CorporateBillingForm slug={slug} reservationId={reservationId} payload={payload} onSaved={() => void loadFolio(reservationId)} />
            </div>
          ) : loading ? (
            <FolioSkeleton />
          ) : null}
        </>
      )}
    </HmsPage>
  );
}

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

const words = (s: string) => {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** A labelled field; native `required` keeps the browser's own per-field messages. */
function F(props: { id: string; label: string; hint?: string; optional?: boolean; children: React.ReactNode }) {
  return <HmsField {...props} />;
}

function LegSelect({ id, paying = false }: { id: string; paying?: boolean }) {
  return (
    <F id={id} label={paying ? "Pays off the part owed by" : "Who pays this"} hint="Only matters if the bill is split between the guest and a company.">
      <select id={id} name="splitLeg" aria-describedby={`${id}-hint`} className={hmsInput}>
        <option value="guest">The guest</option>
        <option value="company">The company</option>
      </select>
    </F>
  );
}

const sk = "bg-slate-200";

function FolioSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
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

const STATUS_TONE: Record<string, "slate" | "green" | "amber" | "red" | "blue"> = {
  checked_in: "blue",
  checked_out: "slate",
};

function FolioRowList({
  title,
  description,
  rows,
  currency,
  emptyTitle,
  emptyText,
  onSelect,
}: {
  title: string;
  description?: string;
  rows: SearchHit[];
  currency: string;
  emptyTitle: string;
  emptyText: string;
  onSelect: (reservationId: string) => void;
}) {
  return (
    <HmsCard
      id="folio-list"
      icon={Receipt}
      meaning="money"
      title={
        <>
          {title}
          {rows.length > 0 ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{rows.length}</span> : null}
        </>
      }
      description={rows.length > 0 ? description : undefined}
      flush
    >
      {rows.length === 0 ? (
        <HmsEmptyState bare art="page" meaning="money" title={emptyTitle} description={emptyText} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{title}</caption>
            <thead className="bg-slate-50 text-sm text-slate-700">
              <tr>
                <th scope="col" className="py-3 pl-5 pr-4 font-semibold">Guest</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Room</th>
                <th scope="col" className="py-3 pr-4 font-semibold">Bill number</th>
                <th scope="col" className="py-3 pr-4 text-right font-semibold">Still to pay</th>
                <th scope="col" className="py-3 pr-5 text-right font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((h) => (
                <tr
                  key={h.reservationId}
                  className="cursor-pointer transition-colors hover:bg-emerald-50/40"
                  onClick={() => onSelect(h.reservationId)}
                >
                  <td className="py-3 pl-5 pr-4">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(h.reservationId);
                        }}
                        className={`truncate rounded text-left font-medium text-slate-900 hover:text-blue-700 hover:underline ${focusRing}`}
                      >
                        {h.guestName}
                        <span className="sr-only">: open bill {h.folioNumber}</span>
                      </button>
                      <p className="truncate text-xs text-slate-600">{h.confirmationCode}</p>
                    </div>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{h.roomCode ? `Room ${h.roomCode}` : <Nothing />}</td>
                  <td className="py-3 pr-4 font-mono text-xs text-slate-700">{h.folioNumber}</td>
                  <td className="py-3 pr-4 text-right">
                    {h.balance != null ? (
                      <span className={`font-semibold tabular-nums ${h.balance > 0 ? "text-red-700" : "text-emerald-700"}`}>
                        {formatPricingAmount(h.balance, currency)}
                        {h.balance <= 0 ? <span className="sr-only"> (settled)</span> : null}
                      </span>
                    ) : (
                      <Nothing />
                    )}
                  </td>
                  <td className="py-3 pr-5 text-right">
                    <HmsPill tone={STATUS_TONE[h.status] ?? "slate"}>{STATUS_LABEL[h.status] ?? words(h.status)}</HmsPill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </HmsCard>
  );
}

function Nothing() {
  return (
    <span className="text-slate-600">
      <span aria-hidden>—</span>
      <span className="sr-only">None</span>
    </span>
  );
}

function FolioRowListSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm" aria-hidden>
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
  onTransfer,
  onReassignSplitLeg,
}: {
  lines: FolioLineRow[];
  currency: string;
  slug: string;
  onVoid: () => void;
  onTransfer: (lineId: string) => void;
  onReassignSplitLeg: (lineIds: string[], splitLeg: "guest" | "company") => void;
}) {
  const [voidTarget, setVoidTarget] = useState<FolioLineRow | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [voidPin, setVoidPin] = useState("");
  const [voiding, setVoiding] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const movable = lines.filter((l) => !l.voided_at && (l.kind === "charge" || l.kind === "discount"));
  const toggleSelected = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const moveSelected = (leg: "guest" | "company") => {
    onReassignSplitLeg([...selectedIds], leg);
    setSelectedIds(new Set());
  };

  const closeVoidDialog = () => {
    setVoidTarget(null);
    setVoidReason("");
    setVoidPin("");
  };

  const submitVoid = async () => {
    if (!voidTarget || !voidReason.trim()) return;
    setVoiding(true);
    try {
      const res = await fetch("/api/hotel/folio/lines/void", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, lineId: voidTarget.id, reason: voidReason.trim(), managerPin: voidPin.trim() || undefined }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not void line", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Charge voided");
      closeVoidDialog();
      onVoid();
    } finally {
      setVoiding(false);
    }
  };

  return (
    <>
    {selectedIds.size > 0 ? (
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm" role="status">
        <span className="font-medium text-emerald-900">
          {selectedIds.size} line{selectedIds.size === 1 ? "" : "s"} selected
        </span>
        <button type="button" className={`${hmsButton.secondary} px-3 py-1.5 ${focusRing}`} onClick={() => moveSelected("guest")}>
          Guest pays these
        </button>
        <button type="button" className={`${hmsButton.secondary} px-3 py-1.5 ${focusRing}`} onClick={() => moveSelected("company")}>
          Company pays these
        </button>
        <button type="button" className={`${hmsButton.quiet} ml-auto ${focusRing}`} onClick={() => setSelectedIds(new Set())}>
          Clear selection
        </button>
      </div>
    ) : movable.length > 0 ? (
      <p className="mt-4 text-sm text-slate-600">
        To split the bill, tick charges and choose who pays them. For example, the company pays for the room while the
        guest pays for extras.
      </p>
    ) : null}
    {lines.length === 0 ? (
      <HmsEmptyState bare art="page" meaning="money" title="Nothing on this bill yet" description="Charges, discounts and payments will be listed here as they're added." />
    ) : (
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">Lines on this bill</caption>
          <thead className="bg-slate-50 text-left text-sm text-slate-700">
            <tr>
              <th scope="col" className="w-10 px-3 py-2.5">
                <span className="sr-only">Select</span>
              </th>
              <th scope="col" className="py-2.5 pr-4 font-semibold">Date</th>
              <th scope="col" className="py-2.5 pr-4 font-semibold">What for</th>
              <th scope="col" className="py-2.5 pr-4 font-semibold">Paid by</th>
              <th scope="col" className="py-2.5 pr-4 text-right font-semibold">Amount</th>
              <th scope="col" className="py-2.5 pr-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((l) => {
              const canMove = !l.voided_at && (l.kind === "charge" || l.kind === "discount");
              return (
                <tr key={l.id} className={l.voided_at ? "bg-slate-50 text-slate-600" : "text-slate-800"}>
                  <td className="px-3 py-2.5">
                    {canMove ? (
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-400 accent-emerald-700"
                        checked={selectedIds.has(l.id)}
                        onChange={() => toggleSelected(l.id)}
                        aria-label={`Select ${l.description ?? l.kind} to choose who pays`}
                      />
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pr-4 text-slate-700">{new Date(l.created_at).toLocaleString("en-GB")}</td>
                  <td className="py-2.5 pr-4">
                    <span className={l.voided_at ? "line-through" : ""}>{l.description ?? words(l.kind)}</span>
                    {l.voided_at ? (
                      <span className="ml-2">
                        <HmsPill tone="red">Voided</HmsPill>
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-700">{l.split_leg === "company" ? "Company" : "Guest"}</td>
                  <td className={`py-2.5 pr-4 text-right font-medium tabular-nums ${l.voided_at ? "line-through" : ""}`}>
                    {formatPricingAmount(l.amount, currency)}
                  </td>
                  <td className="py-2.5 pr-3 text-right">
                    {!l.voided_at && l.kind === "charge" ? (
                      <div className="flex justify-end gap-1">
                        <button type="button" className={`${hmsButton.quiet} ${focusRing}`} onClick={() => onTransfer(l.id)}>
                          Transfer<span className="sr-only"> {l.description ?? "charge"}</span>
                        </button>
                        <button type="button" className={`${hmsButton.danger} py-1.5 ${focusRing}`} onClick={() => setVoidTarget(l)}>
                          Void<span className="sr-only"> {l.description ?? "charge"}</span>
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    )}

    <Dialog open={Boolean(voidTarget)} onOpenChange={(open) => { if (!open) closeVoidDialog(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Void this charge?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {voidTarget ? (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">
              {voidTarget.description ?? words(voidTarget.kind)}: {formatPricingAmount(voidTarget.amount, currency)}
            </p>
          ) : null}
          <F id="void-reason" label="Why is it being voided?" hint="This is saved with the bill so others can see why.">
            <textarea
              id="void-reason"
              autoFocus
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              aria-describedby="void-reason-hint"
              className={`${hmsInput} min-h-[72px]`}
            />
          </F>
          <F id="void-pin" label="Manager PIN" optional hint="Needed if you're not a manager or admin.">
            <input
              id="void-pin"
              type="password"
              autoComplete="off"
              value={voidPin}
              onChange={(e) => setVoidPin(e.target.value)}
              aria-describedby="void-pin-hint"
              className={hmsInput}
            />
          </F>
        </div>
        <DialogFooter>
          <button type="button" className={`${hmsButton.secondary} ${focusRing}`} onClick={closeVoidDialog} disabled={voiding}>
            Keep charge
          </button>
          <button
            type="button"
            className={`inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
            disabled={voiding || !voidReason.trim()}
            onClick={() => void submitVoid()}
          >
            {voiding ? "Voiding…" : "Void charge"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
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
        commissionPlan: fd.get("commissionPlan") || null,
        commissionValue: fd.get("commissionValue") ? Number(fd.get("commissionValue")) : null,
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
    <HmsCard id="folio-company-billing" icon={Building2} meaning="money" title="Company billing" description="Fill this in when a company or travel agent is paying for some or all of the stay.">
      <form onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <F id="bill-to-account" label="Company account" optional>
            <input id="bill-to-account" name="billToAccount" defaultValue={payload.reservation.billToAccount ?? ""} className={hmsInput} />
          </F>
          <F id="po-number" label="Purchase order (PO) number" optional>
            <input id="po-number" name="poNumber" defaultValue={payload.reservation.poNumber ?? ""} className={hmsInput} />
          </F>
        </div>
        <F id="split-notes" label="Notes on splitting the bill" optional>
          <input id="split-notes" name="folioSplitNotes" defaultValue={payload.reservation.folioSplitNotes ?? ""} className={hmsInput} />
        </F>
        <div className="grid gap-4 sm:grid-cols-2">
          <F id="commission-plan" label="Travel agent or commission plan" optional>
            <input id="commission-plan" name="commissionPlan" defaultValue={payload.reservation.commissionPlan ?? ""} className={hmsInput} />
          </F>
          <F id="commission-value" label="Commission amount" optional>
            <input
              id="commission-value"
              name="commissionValue"
              type="number"
              min="0"
              step="0.01"
              defaultValue={payload.reservation.commissionValue ?? ""}
              className={hmsInput}
            />
          </F>
        </div>
        <button type="submit" className={`${hmsButton.secondary} ${focusRing}`}>
          Save company billing
        </button>
      </form>
    </HmsCard>
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
    <div className="max-w-xl">
      <HmsCard
        id="cash-float"
        icon={Coins}
        meaning="money"
        title="Cash float"
        description="Count the cash in the till when your shift starts and again when it ends."
        actions={session ? <HmsPill tone="green">Open</HmsPill> : <HmsPill>Closed</HmsPill>}
      >
        {session ? (
          <div className="space-y-4">
            <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-slate-800">
              Opened {new Date(session.opened_at as string).toLocaleString("en-GB")} with {String(session.opening_balance)} in the till.
            </p>
            <form onSubmit={close} className="space-y-4">
              <F id="closing-balance" label="Cash counted now" hint="Count every note and coin in the till.">
                <input id="closing-balance" name="closingBalance" type="number" step="0.01" required aria-describedby="closing-balance-hint" className={hmsInput} />
              </F>
              <F id="float-notes" label="Notes" optional>
                <input id="float-notes" name="notes" className={hmsInput} />
              </F>
              <button type="submit" className={`${hmsButton.primary} ${focusRing}`}>
                Close the float
              </button>
            </form>
          </div>
        ) : (
          <form onSubmit={open} className="space-y-4">
            <F id="opening-balance" label="Cash in the till now" hint="Count every note and coin before you start.">
              <input id="opening-balance" name="openingBalance" type="number" step="0.01" min="0" required aria-describedby="opening-balance-hint" className={hmsInput} />
            </F>
            <button type="submit" className={`${hmsButton.primary} ${focusRing}`}>
              Open the float
            </button>
          </form>
        )}
      </HmsCard>
    </div>
  );
}
