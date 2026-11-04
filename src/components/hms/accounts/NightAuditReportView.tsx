"use client";

import { Printer } from "lucide-react";
import type { AuditReport } from "@/lib/hms/night-audit-report";
import { HmsCard, hmsButton } from "@/components/hms/hms-ui";

const money = (n: number) => n.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 border-b border-slate-100 py-2 last:border-0 ${strong ? "font-semibold text-slate-900" : "text-slate-700"}`}>
      <dt className="text-sm">{label}</dt>
      <dd className="text-sm tabular-nums">{value}</dd>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-1 text-sm font-semibold text-slate-900">{title}</h3>
      <dl>{children}</dl>
    </section>
  );
}

/** The end-of-day (manager's) report for one closed day. Prints on one page. */
export function NightAuditReportView({ report, onClose }: { report: AuditReport; onClose: () => void }) {
  const r = report;
  return (
    <HmsCard
      id="night-audit-report"
      title={`End-of-day report for ${r.date}`}
      meaning="money"
      className="print:border-0 print:shadow-none"
      actions={
        <div className="flex gap-2 print:hidden">
          <button type="button" className={hmsButton.secondary} onClick={() => window.print()}>
            <Printer className="h-4 w-4" aria-hidden /> Print
          </button>
          <button type="button" className={hmsButton.quiet} onClick={onClose}>
            Close report
          </button>
        </div>
      }
    >
      <p className="mb-4 text-sm text-slate-600">
        {r.automatic ? "Closed automatically" : "Closed by staff"} on {new Date(r.generatedAt).toLocaleString("en-GB")}.
        {r.overrideReason ? ` Reason given for closing with things open: ${r.overrideReason}` : ""}
      </p>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Block title="Rooms">
          <Row label="Rooms sold" value={`${r.rooms.sold} of ${r.rooms.total}`} />
          <Row label="Occupancy" value={`${r.rooms.occupancyPercent}%`} />
          <Row label="Average daily rate" value={money(r.rooms.adr)} />
          <Row label="Revenue per available room" value={money(r.rooms.revpar)} />
          <Row label="Arrived" value={String(r.rooms.arrivals)} />
          <Row label="Left" value={String(r.rooms.departures)} />
          <Row label="In house now" value={String(r.rooms.inHouseAtClose)} />
        </Block>
        <Block title="Revenue">
          <Row label="Rooms" value={money(r.revenue.roomRevenue)} />
          <Row label="Food and drink" value={money(r.revenue.fbRevenue)} />
          <Row label="Other departments" value={money(r.revenue.otherRevenue)} />
          <Row label="No department chosen" value={money(r.revenue.unclassifiedRevenue)} />
          <Row label="Total revenue" value={money(r.totalRevenue)} strong />
          <Row label="VAT and levies (owed to government)" value={money(r.revenue.taxesCollected)} />
        </Block>
        <Block title="Money">
          <Row label="Cash taken" value={money(r.payments.cashTotal)} />
          <Row label="Card and POS" value={money(r.payments.cardTotal)} />
          <Row label="Billed to companies" value={money(r.payments.cityLedgerTotal)} />
          <Row label="Deposits moved onto bills" value={money(r.payments.depositsApplied)} />
        </Block>
        <Block title="Owed and held">
          <Row label="In-house guests owe" value={money(r.guestLedgerOutstanding)} />
          <Row label="Deposits held for future stays" value={money(r.depositsHeld)} />
        </Block>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
        <section aria-label="No-shows">
          <h3 className="mb-1 text-sm font-semibold text-slate-900">No-shows ({r.noShows.length})</h3>
          {r.noShows.length === 0 ? (
            <p className="text-sm text-slate-600">None handled by this audit.</p>
          ) : (
            <ul className="space-y-1 text-sm text-slate-700">
              {r.noShows.map((n) => (
                <li key={n.confirmationCode}>
                  {n.confirmationCode}: deposit kept {money(n.keptDeposit)}, fee charged {money(n.fee)}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="Left open">
          <h3 className="mb-1 text-sm font-semibold text-slate-900">Left open when the day closed</h3>
          {r.exceptions.length === 0 ? (
            <p className="text-sm text-slate-600">Nothing.</p>
          ) : (
            <ul className="space-y-1 text-sm text-slate-700">
              {r.exceptions.map((e) => (
                <li key={e.title}>
                  {e.title}: {e.count}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </HmsCard>
  );
}
