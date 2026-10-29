import { randomUUID } from "crypto";
import { isBookedStayLine, stayLinePart, type FolioLineRow, type FolioSplitLeg } from "@/lib/hms/folio";
import { stayTaxRules, type ExtraNightReservation } from "@/lib/hms/folio-extra-nights";
import { computeNigeriaHospitalityTaxes } from "@/lib/hms/nigeria-hospitality-taxes";
import { formatPricingAmount, type HotelPricingSetup } from "@/lib/hms/room-pricing";

/**
 * Discounts given on a stay's bill, at checkout or from the folio screen.
 *
 * - Off the room: a percentage or an amount of the room charges (booked and extra nights). The
 *   service charge, levy and VAT charged on that amount come off with it, so the tax on the bill
 *   stays right. Only taxes the bill actually carries are reduced.
 * - Off the whole bill: a percentage or an amount of everything charged. The VAT and levies on
 *   the bill come down by the same share, as their own lines; the main line records how the
 *   rest splits across departments, so the night audit takes it off the right revenue.
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

/** Taxes on a room that are the government's: a whole-bill discount takes its share off them. */
const GOVERNMENT_TAX_PARTS = ["vat", "state_levy", "stamp_levy"] as const;
const GOVERNMENT_TAX_WORDING: Record<(typeof GOVERNMENT_TAX_PARTS)[number], string> = {
  vat: "VAT",
  state_levy: "State / local levy",
  stamp_levy: "Stamp levy",
};

/** Where part of a whole-bill discount comes off: a department's revenue (null for untagged lines). */
export type DiscountAllocation = { department: string | null; amount: number };

/**
 * What the bill is made of now, after earlier discounts: each government tax on the rooms, and
 * everything else by department. A whole-bill discount is shared across these.
 */
export function billComposition(lines: FolioLineRow[]) {
  const taxes = new Map<string, number>();
  const departments = new Map<string | null, number>();
  const add = <K,>(m: Map<K, number>, k: K, v: number) => m.set(k, (m.get(k) ?? 0) + v);
  for (const l of lines) {
    if (l.voided_at || (l.kind !== "charge" && l.kind !== "discount")) continue;
    const allocation = l.metadata?.allocation;
    if (Array.isArray(allocation)) {
      for (const a of allocation as DiscountAllocation[]) add(departments, a.department ?? null, -Math.abs(Number(a.amount) || 0));
      continue;
    }
    const part = l.department === "rooms" ? stayLinePart(l) : null;
    if (part && (GOVERNMENT_TAX_PARTS as readonly string[]).includes(part)) add(taxes, part, l.amount);
    else add(departments, l.department ?? null, l.amount);
  }
  return { taxes, departments };
}

/** A whole-bill discount of `amount` shared across what the bill is made of. Rounding lands on the biggest department. */
export function shareBillDiscount(lines: FolioLineRow[], amount: number) {
  const { taxes, departments } = billComposition(lines);
  const total = [...taxes.values(), ...departments.values()].filter((v) => v > 0).reduce((s, v) => s + v, 0);
  if (!(total > 0)) return { taxes: [] as { part: string; amount: number }[], allocation: [] as DiscountAllocation[] };
  const share = (v: number) => roundMoney((amount * v) / total);
  const taxLines = [...taxes].filter(([, v]) => v > 0).map(([part, v]) => ({ part, amount: share(v) })).filter((t) => t.amount > 0);
  const allocation: DiscountAllocation[] = [...departments]
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([department, v]) => ({ department, amount: share(v) }));
  const rest = roundMoney(amount - taxLines.reduce((s, t) => s + t.amount, 0) - allocation.reduce((s, a) => s + a.amount, 0));
  if (allocation[0]) allocation[0].amount = roundMoney(allocation[0].amount + rest);
  return { taxes: taxLines, allocation: allocation.filter((a) => a.amount !== 0) };
}

export type DiscountLine = {
  part: string;
  amount: number;
  description: string;
  /** The line's department, when it isn't the discount's usual one. */
  department?: string | null;
  /** For a whole-bill discount's main line: how it splits across departments, for the books. */
  allocation?: DiscountAllocation[];
};

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
  } else {
    // Off the whole bill: the VAT and levies on it come down by the same share, as their own
    // lines (so the bill and the invoice show the right tax); the rest is split by department.
    const shared = shareBillDiscount(lines, main);
    const taxTotal = roundMoney(shared.taxes.reduce((s, t) => s + t.amount, 0));
    out[0] = { ...out[0], amount: roundMoney(main - taxTotal), allocation: shared.allocation };
    for (const t of shared.taxes) {
      out.push({
        part: t.part,
        amount: t.amount,
        department: "rooms",
        description: `${GOVERNMENT_TAX_WORDING[t.part as keyof typeof GOVERNMENT_TAX_WORDING] ?? t.part} taken off with the bill discount`,
      });
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
    department: l.department !== undefined ? l.department : params.request.target === "room" ? "rooms" : null,
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
      ...(l.allocation ? { allocation: l.allocation } : {}),
      ...(params.windowSet ? { window_set: true } : {}),
    },
  }));
}
