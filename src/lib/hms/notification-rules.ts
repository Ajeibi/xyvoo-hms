import { emitNotification, type EmitNotificationInput } from "@/lib/hms/front-desk-ops";

type Base = Omit<EmitNotificationInput, "type" | "title" | "body">;

export async function notifyWalkInCheckIn(
  base: Base & { guestName: string; confirmationCode: string },
) {
  await emitNotification({
    ...base,
    type: "walk_in_check_in",
    title: "Guest checked in",
    body: `${base.guestName} · ${base.confirmationCode}`,
    severity: "info",
    entityType: "reservation",
    entityId: base.entityId,
  });
}

export async function notifyVipArrival(
  base: Base & { guestName: string; roomCode: string | null },
) {
  await emitNotification({
    ...base,
    type: "vip_arrival",
    title: "VIP arrival",
    body: `${base.guestName}${base.roomCode ? ` · Room ${base.roomCode}` : ""}`,
    severity: "warning",
    entityType: "reservation",
    entityId: base.entityId,
  });
}

export async function notifyRoomStatus(
  base: Base & { roomCode: string; statusLabel: string },
) {
  await emitNotification({
    ...base,
    type: "room_status",
    title: `Room ${base.roomCode} updated`,
    body: `Status is now ${base.statusLabel}.`,
    severity: "info",
    entityType: "room_unit",
    entityId: base.entityId,
  });
}

export async function notifyMaintenance(
  base: Base & { roomCode: string; notes?: string },
) {
  await emitNotification({
    ...base,
    type: "maintenance",
    title: `Maintenance — Room ${base.roomCode}`,
    body: base.notes?.trim() || "Room marked for maintenance.",
    severity: "warning",
    entityType: "room_unit",
    entityId: base.entityId,
  });
}

export async function notifyRoomReady(
  base: Base & { roomCode: string },
) {
  await emitNotification({
    ...base,
    type: "room_ready",
    title: `Room ${base.roomCode} ready`,
    body: "Housekeeping marked room ready for occupancy.",
    severity: "info",
    entityType: "room_unit",
    entityId: base.entityId,
  });
}

export async function notifyArrivalRoomNotReady(
  base: Base & { guestName: string; roomCode: string | null; confirmationCode: string },
) {
  await emitNotification({
    ...base,
    type: "arrival_room_not_ready",
    title: "Room not ready",
    body: `${base.guestName} · ${base.confirmationCode}${base.roomCode ? ` · Room ${base.roomCode}` : ""}`,
    severity: "warning",
    entityType: "reservation",
    entityId: base.entityId,
  });
}

export async function notifyArrivalOutstandingPayment(
  base: Base & { guestName: string; confirmationCode: string; balanceLabel: string },
) {
  await emitNotification({
    ...base,
    type: "arrival_outstanding_payment",
    title: "Outstanding balance",
    body: `${base.guestName} · ${base.confirmationCode} · ${base.balanceLabel}`,
    severity: "warning",
    entityType: "reservation",
    entityId: base.entityId,
  });
}

export async function notifyCheckoutCompleted(
  base: Base & { guestName: string; roomCode: string; wasOverdue: boolean },
) {
  await emitNotification({
    ...base,
    type: "checkout_completed",
    title: `Checkout — Room ${base.roomCode}`,
    body: `${base.guestName} checked out${base.wasOverdue ? " (was overdue)" : ""}.`,
    severity: base.wasOverdue ? "warning" : "info",
    entityType: "reservation",
    entityId: base.entityId,
  });
}

export async function notifyOverdueCheckout(
  base: Base & { guestName: string; roomCode: string },
) {
  await emitNotification({
    ...base,
    type: "overdue_checkout",
    title: `Overdue checkout — Room ${base.roomCode}`,
    body: `${base.guestName} is past scheduled departure.`,
    severity: "critical",
    entityType: "reservation",
    entityId: base.entityId,
  });
}

export async function notifyPaymentReceived(
  base: Base & { amount: number; method: string; folioNumber: string },
) {
  await emitNotification({
    ...base,
    type: "payment_received",
    title: "Payment received",
    body: `${base.amount} via ${base.method} · Folio ${base.folioNumber}`,
    severity: "info",
    entityType: "folio_transaction",
    entityId: base.entityId,
  });
}

export async function notifyFolioBalanceDue(
  base: Base & { balance: number; folioNumber: string },
) {
  await emitNotification({
    ...base,
    type: "folio_balance_due",
    title: "Balance due on folio",
    body: `${base.balance} outstanding · Folio ${base.folioNumber}`,
    severity: "warning",
    entityType: "reservation",
    entityId: base.entityId,
  });
}

export async function notifyRefundPending(
  base: Base & { amount: number; folioNumber: string },
) {
  await emitNotification({
    ...base,
    type: "refund_pending",
    title: "Refund pending",
    body: `${base.amount} refund in progress · Folio ${base.folioNumber}`,
    severity: "warning",
    entityType: "folio_transaction",
    entityId: base.entityId,
  });
}

export async function notifyLargeChargePosted(
  base: Base & { amount: number; description: string },
) {
  await emitNotification({
    ...base,
    type: "large_charge_posted",
    title: "Large charge posted",
    body: `${base.description} — ${base.amount}`,
    severity: "warning",
    entityType: "folio_transaction",
    entityId: base.entityId,
  });
}

export async function notifyCashFloatVariance(
  base: Base & { variance: number },
) {
  await emitNotification({
    ...base,
    type: "cash_float_variance",
    title: "Cash float variance",
    body: `Session closed with variance of ${base.variance}`,
    severity: "warning",
    entityType: "cash_float_session",
    entityId: base.entityId,
  });
}

export async function notifyCommissionDue(
  base: Base & { guestName: string; amount: number },
) {
  await emitNotification({
    ...base,
    type: "commission_due",
    title: "Travel agent commission due",
    body: `${base.guestName} · ${base.amount} commission flagged`,
    severity: "info",
    entityType: "reservation",
    entityId: base.entityId,
  });
}
