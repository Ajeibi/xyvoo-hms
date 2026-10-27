import { randomUUID } from "crypto";
import { isBookedStayLine, type FolioLineRow, type FolioSplitLeg } from "@/lib/hms/folio";
import { stayTaxRules, type ExtraNightReservation } from "@/lib/hms/folio-extra-nights";
import { computeNigeriaHospitalityTaxes } from "@/lib/hms/nigeria-hospitality-taxes";
import { formatPricingAmount, type HotelPricingSetup } from "@/lib/hms/room-pricing";

/**
 * Discounts given on a stay's bill, at checkout or from the folio screen.
 *
 * - Off the room: a percentage or an amount of the room charges (booked and extra nights). The
 *   service charge, levy and VAT charged on that amount come off with it, so the tax on the bill
 *   stays right. Only taxes the bill actually carries are reduced.
 * - Off the whole bill: a percentage or an amount of everything charged, as one line.
 *
 * A discount's lines share the reference `discount:<id>:<part>`; voiding its main line (`:room`
 * or `:bill`) voids the rest. A discount can't be more than what it comes off.
 */

export const DISCOUNT_REF_PREFIX = "discount:";

export type DiscountTarget = "room" | "bill";
export type DiscountMode = "percent" | "amount";

export type DiscountRequest = {
  target: DiscountTarget;
  mode: DiscountMode;
  value: number;
  reason: string;
};

type TaxPart = "service_charge" | "state_levy" | "vat";
const TAX_PARTS: TaxPart[] = ["service_charge", "state_levy", "vat"];
const TAX_WORDING: Record<TaxPart, RegExp> = {
  service_charge: /^Service charge/i,
  state_levy: /^State \/ local levy/i,
  vat: /^VAT/i,
};

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

function partOf(line: FolioLineRow): string | null {
  if (typeof line.metadata?.part === "string") return line.metadata.part;
  const ref = line.reference ?? "";
  if (ref.startsWith("extra_night:") || ref.startsWith(DISCOUNT_REF_PREFIX)) return ref.slice(ref.lastIndexOf(":") + 1);
  return null;
}

/** What a discount can come off: the room charges, the taxes the bill carries, and the whole bill. */
export function discountBases(lines: FolioLineRow[]) {
  const active = lines.filter((l) => !l.voided_at);
  let room = 0;
  let billCharges = 0;
  let billDiscounts = 0;
  const taxed = new Set<TaxPart>();

  for (const l of active) {
    const part = partOf(l);
    if (l.kind === "charge") {
      billCharges += l.amount;
      // Room nights booked at check-in and extra nights, with their taxes; not extras added later.
      if (isBookedStayLine(l) || (l.reference ?? "").startsWith("extra_night:")) {
        const tax = TAX_PARTS.find((p) => part === p || (!part && TAX_WORDING[p].test(l.description ?? "")));
        if (tax) taxed.add(tax);
        else if (!part || part === "room") room += l.amount;
      }
    } else if (l.kind === "discount") {
      billDiscounts += -l.amount;
      // Room discounts (at check-in they're already netted off the room line; these are later ones).
      if (part === "room") room += l.amount;
    }
  }
  return {
    room: roundMoney(Math.max(0, room)),
    bill: roundMoney(Math.max(0, billCharges - billDiscounts)),
    billCharges: roundMoney(billCharges),
    taxed,
  };
}

export type DiscountLine = { part: string; amount: number; description: string };

export type DiscountPlan =
  | { ok: true; lines: DiscountLine[]; total: number; base: number; percentOfBill: number }
  | { ok: false; error: string };

/** Works out the lines a discount posts, without posting them. */
export function planDiscount(
  lines: FolioLineRow[],
  reservation: Pick<ExtraNightReservation, "pricing_snapshot" | "tax_exempt" | "vat_applicable">,
  pricing: HotelPricingSetup,
  req: DiscountRequest,
): DiscountPlan {
  const reason = req.reason.trim();
  if (!reason) return { ok: false, error: "Say why the discount is given." };
  if (!(req.value > 0)) return { ok: false, error: "Enter a discount above zero." };
  if (req.mode === "percent" && req.value > 100) return { ok: false, error: "A percentage can't be more than 100." };

  const bases = discountBases(lines);
  const base = req.target === "room" ? bases.room : bases.bill;
  if (base <= 0) {
    return { ok: false, error: req.target === "room" ? "There are no room charges to discount." : "There is nothing on the bill to discount." };
  }
  const main = roundMoney(req.mode === "percent" ? (base * req.value) / 100 : req.value);
  if (main > base + 0.005) {
    return {
      ok: false,
      error: `That's more than the ${req.target === "room" ? "room charges" : "bill"} (${formatPricingAmount(base, pricing.currency)}).`,
    };
  }

  const what =
    req.mode === "percent"
      ? `${req.value}% off the ${req.target === "room" ? "room" : "bill"}`
      : `${formatPricingAmount(main, pricing.currency)} off the ${req.target === "room" ? "room" : "bill"}`;
  const out: DiscountLine[] = [{ part: req.target, amount: main, description: `Discount, ${what}: ${reason}` }];

  if (req.target === "room") {
    const rules = stayTaxRules(reservation, pricing);
    const taxes = computeNigeriaHospitalityTaxes({
      roomTaxableBase: main,
      serviceChargeRatePercent: bases.taxed.has("service_charge") ? rules.serviceChargeRatePercent : 0,
      stateLevyRatePercent: bases.taxed.has("state_levy") ? rules.stateLevyRatePercent : 0,
      exemptions: { ...rules.exemptions, exemptVat: rules.exemptions.exemptVat || !bases.taxed.has("vat") },
    });
    const taxLines: [TaxPart, number, string][] = [
      ["service_charge", taxes.serviceChargeAmount, "Service charge taken off with the room discount"],
      ["state_levy", taxes.stateLevyAmount, "State / local levy taken off with the room discount"],
      ["vat", taxes.vatAmount, "VAT taken off with the room discount"],
    ];
    for (const [part, amount, description] of taxLines) {
      if (amount > 0) out.push({ part, amount, description });
    }
  }

  const total = roundMoney(out.reduce((s, l) => s + l.amount, 0));
  return {
    ok: true,
    lines: out,
    total,
    base,
    percentOfBill: bases.billCharges > 0 ? roundMoney((total / bases.billCharges) * 100) : 100,
  };
}

/** Whether staff need a manager PIN for a discount of this size. Owners and managers never do. */
export function discountNeedsPin(percentOfBill: number, limitPercent: number) {
  return !(limitPercent > 0 && percentOfBill <= limitPercent + 1e-9);
}

/** Folio rows for a planned discount, ready to insert in one go. */
export function discountRows(
  plan: Extract<DiscountPlan, { ok: true }>,
  params: {
    tenantId: string;
    reservationId: string;
    postedBy: string;
    currency: string;
    splitLeg: FolioSplitLeg;
    /** True when staff picked the window; otherwise the stay's routing rules decide. */
    windowSet?: boolean;
    request: DiscountRequest;
    source: "checkout" | "folio";
  },
) {
  const group = randomUUID();
  const now = Date.now();
  return plan.lines.map((l, i) => ({
    // A millisecond apart so the bill lists the discount first, then its taxes.
    created_at: new Date(now + i).toISOString(),
    tenant_id: params.tenantId,
    reservation_id: params.reservationId,
    kind: "discount",
    amount: -l.amount,
    method: "system",
    status: "posted",
    description: l.description,
    department: params.request.target === "room" ? "rooms" : null,
    posted_by: params.postedBy,
    reference: `${DISCOUNT_REF_PREFIX}${group}:${l.part}`,
    split_leg: params.splitLeg,
    currency_code: params.currency,
    metadata: {
      part: l.part,
      discountGroup: group,
      target: params.request.target,
      mode: params.request.mode,
      value: params.request.value,
      reason: params.request.reason.trim(),
      source: params.source,
      ...(params.windowSet ? { window_set: true } : {}),
    },
  }));
}
