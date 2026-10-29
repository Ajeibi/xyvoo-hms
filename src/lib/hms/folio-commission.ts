import type { SupabaseClient } from "@supabase/supabase-js";
import { EARLY_CHECKOUT_ADJUSTMENT_REF, isBookedStayLine, stayLinePart, type FolioLineRow } from "@/lib/hms/folio";
import { EXTRA_NIGHT_REF_PREFIX } from "@/lib/hms/folio-extra-nights";
import { DISCOUNT_REF_PREFIX } from "@/lib/hms/folio-discounts";
import { createVendor } from "@/lib/hms/procurement-vendors";
import { createVendorBill, getApAccountId } from "@/lib/hms/vendor-bills";

/*
 * Travel agent commission. Agents (and booking sites the hotel pays commission to) are suppliers
 * marked as travel agents, so their bills are paid through Accounts like any supplier's. A stay
 * names its agent, keeping the percentage agreed at that moment. At check-out the commission is
 * worked out on the room (booked nights and extra nights, after room discounts and the early
 * check-out credit, without taxes) and posted as a supplier bill: Commission & OTA Fees (5600)
 * against Accounts Payable (2000). One bill per stay.
 */

export type TravelAgent = { id: string; name: string; commissionPercent: number; email: string | null; phone: string | null };

function roundMoney(n: number) {
  return Math.round(n * 100) / 100;
}

export async function listTravelAgents(supabase: SupabaseClient, tenantId: string): Promise<TravelAgent[]> {
  const { data } = await supabase
    .schema("hotel")
    .from("vendors")
    .select("id,name,commission_percent,email,phone,status")
    .eq("tenant_id", tenantId)
    .eq("is_travel_agent", true)
    .order("name");
  return (data ?? [])
    .filter((v) => v.status !== "inactive")
    .map((v) => ({
      id: v.id as string,
      name: v.name as string,
      commissionPercent: Number(v.commission_percent) || 0,
      email: (v.email as string | null) ?? null,
      phone: (v.phone as string | null) ?? null,
    }));
}

/** Adds an agent (as a supplier marked as a travel agent), or changes an agent's rate. */
export async function saveTravelAgent(
  supabase: SupabaseClient,
  params: { tenantId: string; id?: string; name: string; commissionPercent: number; email?: string; phone?: string },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const percent = roundMoney(params.commissionPercent);
  if (!(percent >= 0 && percent <= 100)) return { ok: false, error: "Commission must be between 0 and 100%." };
  if (!params.name.trim()) return { ok: false, error: "Enter the agent's name." };

  let id = params.id;
  if (!id) {
    const created = await createVendor(supabase, {
      tenantId: params.tenantId,
      name: params.name,
      email: params.email,
      phone: params.phone,
      notes: "Travel agent: earns commission on the stays they book.",
    });
    if (!created.vendor) return { ok: false, error: created.error ?? "The agent couldn't be added." };
    id = created.vendor.id;
  }
  const { error } = await supabase
    .schema("hotel")
    .from("vendors")
    .update({
      is_travel_agent: true,
      commission_percent: percent,
      name: params.name.trim(),
      ...(params.email !== undefined ? { email: params.email.trim() || null } : {}),
      ...(params.phone !== undefined ? { phone: params.phone.trim() || null } : {}),
    })
    .eq("tenant_id", params.tenantId)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, id };
}

/** Names a stay's agent (or clears it), keeping the agent's current rate for this stay. */
export async function setStayAgent(
  supabase: SupabaseClient,
  params: { tenantId: string; reservationId: string; agentId: string | null },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: r } = await supabase.schema("hotel").from("reservations").select("commission_bill_id").eq("tenant_id", params.tenantId).eq("id", params.reservationId).maybeSingle();
  if (!r) return { ok: false, error: "Reservation not found." };
  if (r.commission_bill_id) return { ok: false, error: "This stay's commission has already been billed, so its agent can't change." };

  let percent: number | null = null;
  let name: string | null = null;
  if (params.agentId) {
    const { data: agent } = await supabase
      .schema("hotel")
      .from("vendors")
      .select("name,commission_percent,is_travel_agent")
      .eq("tenant_id", params.tenantId)
      .eq("id", params.agentId)
      .maybeSingle();
    if (!agent?.is_travel_agent) return { ok: false, error: "That travel agent wasn't found." };
    percent = Number(agent.commission_percent) || 0;
    name = agent.name as string;
  }
  const { error } = await supabase
    .schema("hotel")
    .from("reservations")
    .update({
      travel_agent_vendor_id: params.agentId,
      agent_commission_percent: percent,
      // Kept in step for older screens and reports that read the free-text fields.
      travel_agent_name: name,
      commission_plan: percent != null ? `${percent}% of the room` : null,
    })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.reservationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/**
 * The room revenue commission is earned on: booked and extra nights, less room discounts and the
 * early check-out credit. Taxes and extras don't count.
 */
export function commissionBase(lines: FolioLineRow[]) {
  let base = 0;
  for (const l of lines) {
    if (l.voided_at || l.department !== "rooms") continue;
    const ref = l.reference ?? "";
    const isRoomStay =
      isBookedStayLine(l) ||
      ref.startsWith(EXTRA_NIGHT_REF_PREFIX) ||
      ref.startsWith(DISCOUNT_REF_PREFIX) ||
      ref === EARLY_CHECKOUT_ADJUSTMENT_REF;
    if (isRoomStay && stayLinePart(l) === "room") base += l.amount;
  }
  return roundMoney(Math.max(0, base));
}

export function commissionFor(lines: FolioLineRow[], percent: number) {
  const base = commissionBase(lines);
  return { base, amount: roundMoney((base * Math.max(0, percent)) / 100) };
}

/**
 * At check-out: posts the agent's commission as a supplier bill, once per stay. Bills above the
 * hotel's approval limits wait for approval in Accounts, like any supplier bill.
 */
export async function postCommissionBill(
  supabase: SupabaseClient,
  params: { tenantId: string; reservationId: string; lines: FolioLineRow[]; currency: string; userId: string },
): Promise<{ posted: false; reason?: string } | { posted: true; billId: string; amount: number; agentName: string; status: string }> {
  const { data: r } = await supabase
    .schema("hotel")
    .from("reservations")
    .select("confirmation_code,travel_agent_vendor_id,agent_commission_percent,commission_bill_id,vendors:travel_agent_vendor_id(name)")
    .eq("tenant_id", params.tenantId)
    .eq("id", params.reservationId)
    .maybeSingle();
  if (!r?.travel_agent_vendor_id || r.commission_bill_id) return { posted: false };
  const percent = Number(r.agent_commission_percent) || 0;
  const { base, amount } = commissionFor(params.lines, percent);
  if (amount <= 0) return { posted: false, reason: "No room revenue to pay commission on." };

  const [apAccountId, { data: expense }] = await Promise.all([
    getApAccountId(supabase, params.tenantId),
    supabase.schema("hotel").from("chart_of_accounts").select("id").eq("tenant_id", params.tenantId).eq("code", "5600").eq("is_active", true).maybeSingle(),
  ]);
  if (!apAccountId || !expense) {
    return { posted: false, reason: "Add the Accounts Payable (2000) and Commission & OTA Fees (5600) accounts in Chart of accounts." };
  }

  const agentEmbed = r.vendors as { name: string } | { name: string }[] | null;
  const agentName = (Array.isArray(agentEmbed) ? agentEmbed[0]?.name : agentEmbed?.name) ?? "Travel agent";
  const bill = await createVendorBill(supabase, {
    tenantId: params.tenantId,
    vendorId: r.travel_agent_vendor_id as string,
    department: "Front Desk",
    billReference: `Commission ${r.confirmation_code}`,
    billDate: new Date().toISOString().slice(0, 10),
    currency: params.currency,
    expenseAccountId: expense.id as string,
    apAccountId,
    subtotal: amount,
    notes: `${percent}% commission on ${base.toLocaleString("en-NG")} room revenue for stay ${r.confirmation_code}.`,
    createdBy: params.userId,
  });
  if (!bill.ok) return { posted: false, reason: bill.error };

  await supabase.schema("hotel").from("reservations").update({ commission_bill_id: bill.id, commission_value: amount }).eq("id", params.reservationId);
  return { posted: true, billId: bill.id, amount, agentName, status: bill.status };
}
