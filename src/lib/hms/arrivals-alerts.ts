import type { SupabaseClient } from "@supabase/supabase-js";
import {
  notifyArrivalOutstandingPayment,
  notifyArrivalRoomNotReady,
} from "@/lib/hms/notification-rules";
import type { PaymentDisplayStatus } from "@/lib/hms/front-desk-board";
import type { RoomReadinessStatus } from "@/lib/hms/arrivals-workbench";
import { formatPricingAmount } from "@/lib/hms/room-pricing";

async function hasRecentNotification(
  supabase: SupabaseClient,
  tenantId: string,
  type: string,
  entityId: string,
  hours = 8,
) {
  const since = new Date(Date.now() - hours * 3600000).toISOString();
  const { data } = await supabase
    .schema("hotel")
    .from("notifications")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("type", type)
    .eq("entity_id", entityId)
    .gte("created_at", since)
    .limit(1);
  return Boolean(data?.length);
}

export async function maybeEmitArrivalAlerts(params: {
  supabase: SupabaseClient;
  tenantId: string;
  reservationId: string;
  guestName: string;
  confirmationCode: string;
  status: string;
  arrivalAt: string;
  roomCode: string | null;
  roomReadiness: RoomReadinessStatus | null;
  paymentStatus: PaymentDisplayStatus;
  balance: number;
  currency: string;
}) {
  if (params.status !== "confirmed") return;

  const arrivalMs = new Date(params.arrivalAt).getTime();
  const within2h = arrivalMs - Date.now() <= 2 * 3600000 && arrivalMs >= Date.now() - 3600000;

  if (
    params.roomReadiness &&
    params.roomReadiness !== "ready" &&
    params.roomReadiness !== "inspected"
  ) {
    const exists = await hasRecentNotification(
      params.supabase,
      params.tenantId,
      "arrival_room_not_ready",
      params.reservationId,
    );
    if (!exists) {
      await notifyArrivalRoomNotReady({
        tenantId: params.tenantId,
        guestName: params.guestName,
        roomCode: params.roomCode,
        confirmationCode: params.confirmationCode,
        entityId: params.reservationId,
      });
    }
  }

  if (params.paymentStatus === "unpaid" && within2h && params.balance > 0) {
    const exists = await hasRecentNotification(
      params.supabase,
      params.tenantId,
      "arrival_outstanding_payment",
      params.reservationId,
    );
    if (!exists) {
      await notifyArrivalOutstandingPayment({
        tenantId: params.tenantId,
        guestName: params.guestName,
        confirmationCode: params.confirmationCode,
        balanceLabel: formatPricingAmount(params.balance, params.currency),
        entityId: params.reservationId,
      });
    }
  }
}
