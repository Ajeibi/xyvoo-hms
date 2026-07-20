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

export async function notifyReservationCreated(
  base: Base & { guestName: string; confirmationCode: string; arrivalDate: string },
) {
  await emitNotification({
    ...base,
    type: "reservation_created",
    title: "New reservation created",
    body: `${base.guestName} · ${base.confirmationCode} · Arriving ${base.arrivalDate}`,
    severity: "info",
    entityType: "reservation",
    entityId: base.entityId,
  });
}

export async function notifyReservationCancelled(
  base: Base & { guestName: string; confirmationCode: string },
) {
  await emitNotification({
    ...base,
    type: "reservation_cancelled",
    title: "Reservation cancelled",
    body: `${base.guestName} · ${base.confirmationCode}`,
    severity: "warning",
    entityType: "reservation",
    entityId: base.entityId,
  });
}

export async function notifyGuestIncidentLogged(
  base: Base & { caseType: "complaint" | "incident"; category: string; incidentSeverity: string },
) {
  await emitNotification({
    ...base,
    type: "guest_incident_logged",
    title: base.caseType === "complaint" ? "Complaint logged" : "Incident logged",
    body: `${base.category.replace(/_/g, " ")} · ${base.incidentSeverity} severity`,
    severity:
      base.incidentSeverity === "critical" ? "critical" : base.incidentSeverity === "high" ? "warning" : "info",
    entityType: "guest_incident",
    entityId: base.entityId,
  });
}

export async function notifyGuestIncidentEscalated(
  base: Base & { caseType: "complaint" | "incident"; category: string; department: string },
) {
  await emitNotification({
    ...base,
    type: "guest_incident_escalated",
    title: base.caseType === "complaint" ? "Complaint escalated" : "Incident escalated",
    body: `${base.category.replace(/_/g, " ")} escalated to ${base.department.replace(/_/g, " ")}`,
    severity: "warning",
    entityType: "guest_incident",
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

export async function notifyLowStock(
  base: Base & { itemName: string; locationName: string; qtyOnHand: number; unitOfMeasure: string },
) {
  await emitNotification({
    ...base,
    type: "low_stock",
    title: `Low stock — ${base.itemName}`,
    body: `${base.locationName}: ${base.qtyOnHand} ${base.unitOfMeasure} remaining, at or below reorder point.`,
    severity: "warning",
    entityType: "inventory_item",
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

export async function notifyPriorityTaskOverdue(
  base: Base & { roomCode: string; priorityLevel: string },
) {
  await emitNotification({
    ...base,
    type: "housekeeping_priority_overdue",
    title: `Overdue — Room ${base.roomCode}`,
    body: `${base.priorityLevel} priority clean is past its target time.`,
    severity: base.priorityLevel === "vip" || base.priorityLevel === "urgent" ? "critical" : "warning",
    entityType: "housekeeping_task",
    entityId: base.entityId,
  });
}

export async function notifyInspectionFailed(
  base: Base & { roomCode: string; note?: string | null },
) {
  await emitNotification({
    ...base,
    type: "housekeeping_inspection_failed",
    title: `Inspection failed — Room ${base.roomCode}`,
    body: base.note?.trim() || "Room needs rework before it can be marked ready.",
    severity: "warning",
    entityType: "housekeeping_task",
    entityId: base.entityId,
  });
}

export async function notifyPoApprovalNeeded(
  base: Base & { poNumber: string; vendorName: string; total: number; currency: string },
) {
  await emitNotification({
    ...base,
    type: "po_approval_needed",
    title: `Approval needed — ${base.poNumber}`,
    body: `${base.vendorName ? `${base.vendorName} · ` : ""}${base.total} ${base.currency} awaiting sign-off.`,
    severity: "warning",
    entityType: "purchase_order",
    entityId: base.entityId,
  });
}

export async function notifyPoApproved(
  base: Base & { poNumber: string; total: number; currency: string },
) {
  await emitNotification({
    ...base,
    type: "po_approved",
    title: `Purchase order approved — ${base.poNumber}`,
    body: `${base.total} ${base.currency} approved and ready to send to the vendor.`,
    severity: "info",
    entityType: "purchase_order",
    entityId: base.entityId,
  });
}

export async function notifyPoRejected(
  base: Base & { poNumber: string; reason: string },
) {
  await emitNotification({
    ...base,
    type: "po_rejected",
    title: `Purchase order rejected — ${base.poNumber}`,
    body: base.reason,
    severity: "warning",
    entityType: "purchase_order",
    entityId: base.entityId,
  });
}

export async function notifyGoodsReceivedDiscrepancy(
  base: Base & { poNumber: string; receiptNumber: string },
) {
  await emitNotification({
    ...base,
    type: "goods_received_discrepancy",
    title: `Delivery discrepancy — ${base.poNumber}`,
    body: `${base.receiptNumber} was received with a quantity or quality discrepancy. Follow up with the vendor.`,
    severity: "critical",
    entityType: "purchase_order",
    entityId: base.entityId,
  });
}

export async function notifyBudgetThresholdReached(
  base: Base & { department: string; percentUsed: number },
) {
  await emitNotification({
    ...base,
    type: "budget_threshold_reached",
    title: `Budget alert — ${base.department}`,
    body: `${base.department} has used ${base.percentUsed}% of its procurement budget for this period.`,
    severity: "warning",
    entityType: "procurement_budget",
    entityId: base.entityId,
  });
}
