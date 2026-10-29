import type { FbCashUpReportModel } from "@/lib/hms/load-fb-print";
import { varianceLabel } from "@/lib/hms/fb-cashup-rules";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { PrintTime } from "@/components/hms/fb/print/FbPrintFrame";

function Row({ label, value, strong = false }: { label: React.ReactNode; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? "text-[14px] font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

const Rule = () => <div className="my-1.5 border-t border-dashed border-black" />;

/** End-of-shift (Z) report for one till, sized for a receipt printer. */
export function FbCashUpReport({ model }: { model: FbCashUpReportModel }) {
  const { session: s, report: r } = model;
  const money = (n: number) => formatPricingAmount(n, model.currency);
  const open = s.status === "open";
  const expected = open ? model.expectedNow : s.expectedCash;
  const name = (id: string | null) => (id ? (model.names[id] ?? "Former staff") : "");

  return (
    <div>
      <div className="text-center">
        <p className="text-[14px] font-bold">{model.hotelName}</p>
        <p>{s.outletName}</p>
        <p className="mt-1 text-[13px] font-bold uppercase tracking-wide">{open ? "Shift report (till open)" : "Cash-up"}</p>
      </div>
      <Rule />
      <p>
        Opened <PrintTime iso={s.openedAt} />
        {s.openedBy ? ` · ${name(s.openedBy)}` : ""}
      </p>
      {s.closedAt ? (
        <p>
          Closed <PrintTime iso={s.closedAt} />
          {s.closedBy ? ` · ${name(s.closedBy)}` : ""}
        </p>
      ) : null}
      <Rule />
      <Row label="Bills paid" value={String(r.bills)} />
      <Row label="Cash" value={money(r.cash)} />
      <Row label="Card machine" value={money(r.card)} />
      {r.roomCharge > 0 ? <Row label="Charged to rooms" value={money(r.roomCharge)} /> : null}
      <Row label="Takings" value={money(r.cash + r.card + r.roomCharge)} strong />
      <Rule />
      <Row label="Cash tips" value={money(r.cashTips)} />
      <Row label="Card tips" value={money(r.cardTips)} />
      {r.voidedLines > 0 ? <Row label={`Removed items (${r.voidedLines})`} value={money(r.voidedValue)} /> : null}
      {r.compedLines > 0 ? <Row label={`Free items (${r.compedLines})`} value={money(r.compedValue)} /> : null}
      {r.priceRuleDiscount !== 0 ? (
        <Row label={r.priceRuleDiscount > 0 ? "Happy-hour money off" : "Time-based extra"} value={money(Math.abs(r.priceRuleDiscount))} />
      ) : null}
      <Rule />
      <p className="font-bold">Cash drawer</p>
      <Row label="Float" value={money(s.openingFloat)} />
      <Row label="+ Cash taken" value={money(open ? r.cash : (s.cashTaken ?? 0))} />
      <Row label="+ Cash tips" value={money(open ? r.cashTips : (s.cashTips ?? 0))} />
      {(s.cashTipsPaidOut ?? 0) > 0 ? <Row label="- Tips paid out" value={money(s.cashTipsPaidOut ?? 0)} /> : null}
      {expected != null ? <Row label="Should hold" value={money(expected)} strong /> : null}
      {!open ? (
        <>
          <Row label="Counted" value={money(s.countedCash ?? 0)} strong />
          <Row label="Difference" value={varianceLabel(s.variance ?? 0, money)} strong />
          {s.varianceReason ? <p className="text-[11px]">Reason: {s.varianceReason}</p> : null}
          {s.approvedByManager && (s.variance ?? 0) !== 0 ? <p className="text-[11px]">Approved by a manager</p> : null}
          {s.notes ? <p className="text-[11px]">Notes: {s.notes}</p> : null}
          <Rule />
          <p className="text-[11px]">
            {s.journalEntryId
              ? "Tips and any difference booked to the accounts."
              : s.postingError && s.postingError !== "posting"
                ? `Not booked to the accounts: ${s.postingError}`
                : "Nothing to book to the accounts."}
          </p>
          <p className="mt-6 border-t border-black pt-0.5 text-[11px]">Counted by</p>
          <p className="mt-4 border-t border-black pt-0.5 text-[11px]">Checked by (manager)</p>
        </>
      ) : null}
      <p className="mt-2 text-center text-[10px]">
        Printed <PrintTime iso={new Date().toISOString()} />
      </p>
    </div>
  );
}
