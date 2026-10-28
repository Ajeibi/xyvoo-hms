import type { FbReceiptModel } from "@/lib/hms/load-fb-print";
import { leftToPay } from "@/lib/hms/fb-payment-rules";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { PrintTime } from "@/components/hms/fb/print/FbPrintFrame";

const METHOD_LABEL: Record<string, string> = {
  cash: "Cash",
  pos: "Card machine",
  card: "Card",
  room_charge: "Charged to room",
  split: "Several payments",
};

function Row({ label, value, strong = false }: { label: React.ReactNode; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? "text-[14px] font-bold" : ""}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

const Rule = () => <div className="my-1.5 border-t border-dashed border-black" />;

/**
 * The guest's bill before payment, or their receipt after. Lines that were
 * removed don't print; free lines print at 0 with "free".
 */
export function FbReceipt({ model }: { model: FbReceiptModel }) {
  const { order, currency } = model;
  const money = (n: number) => formatPricingAmount(n, currency);
  const paid = Boolean(order.settled_at);
  const lines = order.items.filter((i) => i.kitchen_status !== "voided");
  const left = leftToPay(order);
  const where = order.table_code ? `Table ${order.table_code}` : (order.tab_label ?? order.outlet_name ?? "");

  return (
    <div>
      <div className="text-center">
        {model.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- printed slip, plain img keeps it simple
          <img src={model.logoUrl} alt="" className="mx-auto mb-1 max-h-12 max-w-[60%] object-contain grayscale" />
        ) : null}
        <p className="text-[14px] font-bold">{model.hotelName}</p>
        {order.outlet_name ? <p>{order.outlet_name}</p> : null}
        <p className="mt-1 text-[13px] font-bold uppercase tracking-wide">{paid ? "Receipt" : "Bill"}</p>
      </div>
      <Rule />
      <Row label={`#${order.order_number}${order.bill_number > 1 ? ` (bill ${order.bill_number})` : ""}`} value={where} />
      <p>
        <PrintTime iso={order.created_at} />
      </p>
      <Rule />
      {lines.map((item) => (
        <div key={item.id} className="mb-1">
          <Row
            label={`${item.quantity} × ${item.name_snapshot}`}
            value={item.comped_at ? "free" : money(item.price_snapshot * item.quantity)}
          />
          {item.modifiers.length ? (
            <p className="pl-3 text-[11px]">{item.modifiers.map((m) => m.option_name).join(", ")}</p>
          ) : null}
          {item.seat ? <p className="pl-3 text-[11px]">Seat {item.seat}</p> : null}
        </div>
      ))}
      <Rule />
      <Row label="Items" value={money(order.items_total || lines.reduce((s, i) => s + i.price_snapshot * i.quantity, 0))} />
      {order.service_charge_amount > 0 ? (
        <Row label={`Service charge ${order.service_charge_percent}%`} value={money(order.service_charge_amount)} />
      ) : null}
      {order.service_charge_waived_reason ? <p className="text-[11px]">Service charge waived</p> : null}
      {order.levy_amount > 0 ? (
        <Row
          label={`State levy ${order.levy_percent}%${order.prices_include_tax ? " (incl.)" : ""}`}
          value={money(order.levy_amount)}
        />
      ) : null}
      {order.vat_amount > 0 ? (
        <Row label={`VAT ${order.vat_percent}%${order.prices_include_tax ? " (incl.)" : ""}`} value={money(order.vat_amount)} />
      ) : null}
      <Rule />
      <Row label="Total" value={money(order.subtotal)} strong />

      {order.payments?.length ? (
        <>
          <Rule />
          {order.payments.map((p) => (
            <div key={p.id}>
              <Row
                label={`${METHOD_LABEL[p.method] ?? p.method}${p.share_label ? ` · ${p.share_label}` : ""}`}
                value={money(p.amount)}
              />
              {p.method === "cash" && p.change_given > 0 ? (
                <p className="pl-3 text-[11px]">
                  Received {money(p.amount_tendered ?? p.amount)}, change {money(p.change_given)}
                </p>
              ) : null}
            </div>
          ))}
        </>
      ) : null}

      {!paid && order.paid_amount > 0 ? <Row label="Left to pay" value={money(left)} strong /> : null}

      {order.settlement_method === "room_charge" ? (
        <div className="mt-2">
          <p>Charged to the room bill{model.roomChargeRef ? ` (${model.roomChargeRef})` : ""}.</p>
          <p className="mt-6 border-t border-black pt-0.5 text-[11px]">Guest signature</p>
          <p className="mt-4 border-t border-black pt-0.5 text-[11px]">Room number</p>
        </div>
      ) : null}

      <Rule />
      <p className="text-center">{paid ? "Thank you" : "Please pay at the counter or ask your server"}</p>
      <p className="mt-1 text-center text-[10px]">
        Printed <PrintTime iso={new Date().toISOString()} />
      </p>
    </div>
  );
}
