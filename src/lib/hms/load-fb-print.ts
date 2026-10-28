import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { loadKitchenBoard, loadOrderById } from "@/lib/hms/fb-orders";
import type { FbKitchenTicket, FbOrderWithItems } from "@/lib/hms/fb-types";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type FbPrintAccess = { ok: true } | { ok: false; reason: "signed_out" | "forbidden" | "not_found" };

async function printContext(slug: string) {
  const access = await getHmsAccessContext(slug);
  if (!access.userId) return { access, denied: "signed_out" as const };
  const canPrint =
    access.canAccessAllDepartments ||
    access.allowedSections.includes("restaurant-bar") ||
    access.allowedSections.includes("kitchen");
  if (!canPrint) return { access, denied: "forbidden" as const };
  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) return { access, denied: "not_found" as const };
  return { access, tenant, service: createServerSupabaseClient(), denied: null };
}

export type FbReceiptModel = {
  hotelName: string;
  logoUrl: string | null;
  currency: string;
  order: FbOrderWithItems;
  /** Confirmation code of the stay a room-charged bill went to. */
  roomChargeRef: string | null;
};

export async function loadReceiptModel(
  slug: string,
  orderId: string,
): Promise<{ model: FbReceiptModel; denied: null } | { model: null; denied: "signed_out" | "forbidden" | "not_found" }> {
  const ctx = await printContext(slug);
  if (ctx.denied || !ctx.tenant || !ctx.service) return { model: null, denied: ctx.denied ?? "not_found" };
  const order = await loadOrderById(ctx.service, ctx.tenant.id, orderId);
  if (!order) return { model: null, denied: "not_found" };

  let roomChargeRef: string | null = null;
  if (order.settlement_method === "room_charge" && order.reservation_id) {
    const { data } = await ctx.service
      .schema("hotel")
      .from("reservations")
      .select("confirmation_code")
      .eq("id", order.reservation_id)
      .eq("tenant_id", ctx.tenant.id)
      .maybeSingle();
    roomChargeRef = (data?.confirmation_code as string) ?? null;
  }

  return {
    model: {
      hotelName: ctx.access.hotelDisplayName,
      logoUrl: ctx.access.logoUrl,
      currency: normalizePricingSetup(ctx.tenant.pricing_setup).currency,
      order,
      roomChargeRef,
    },
    denied: null,
  };
}

export type FbKitchenTicketModel = {
  hotelName: string;
  ticket: FbKitchenTicket;
};

/** The kitchen's current work for an order (all bills of its table), as on the kitchen screen. */
export async function loadKitchenTicketModel(
  slug: string,
  orderId: string,
): Promise<{ model: FbKitchenTicketModel; denied: null } | { model: null; denied: "signed_out" | "forbidden" | "not_found" }> {
  const ctx = await printContext(slug);
  if (ctx.denied || !ctx.tenant || !ctx.service) return { model: null, denied: ctx.denied ?? "not_found" };
  const order = await loadOrderById(ctx.service, ctx.tenant.id, orderId);
  if (!order) return { model: null, denied: "not_found" };
  const rootId = order.split_from_order_id ?? order.id;
  const tickets = await loadKitchenBoard(ctx.service, ctx.tenant.id, "all");
  const ticket = tickets.find((t) => t.id === rootId);
  if (!ticket) return { model: null, denied: "not_found" };
  return { model: { hotelName: ctx.access.hotelDisplayName, ticket }, denied: null };
}
