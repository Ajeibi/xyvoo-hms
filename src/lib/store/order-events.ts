import { createServerSupabaseClient } from "@/lib/supabase/server";

/*
 * The order timeline (store.order_events). Created, paid and status changes
 * are written by database triggers; notes, tracking, refunds and emails are
 * written here, with who did them. Writing to the timeline never stops the
 * thing it records.
 */

export type OrderEventKind = "created" | "paid" | "status_changed" | "note" | "tracking" | "refund" | "email_sent" | "restocked";

export type OrderActor = { userId: string | null; name: string | null };

export type OrderEvent = {
  id: string;
  kind: OrderEventKind;
  message: string;
  data: Record<string, unknown>;
  actorName: string | null;
  createdAt: string;
};

const events = () => createServerSupabaseClient().schema("store").from("order_events");

export async function recordOrderEvent(
  tenantId: string,
  orderId: string,
  event: { kind: OrderEventKind; message: string; data?: Record<string, unknown> },
  actor?: OrderActor,
) {
  const { error } = await events().insert({
    tenant_id: tenantId,
    order_id: orderId,
    kind: event.kind,
    message: event.message.slice(0, 2000),
    data: event.data ?? {},
    actor_user_id: actor?.userId ?? null,
    actor_name: actor?.name ?? null,
  });
  if (error) console.error("[order events] not recorded", { orderId, kind: event.kind, error: error.message });
  return !error;
}

export async function listOrderEvents(tenantId: string, orderId: string): Promise<OrderEvent[]> {
  const { data, error } = await events()
    .select("id, kind, message, data, actor_name, created_at")
    .eq("tenant_id", tenantId)
    .eq("order_id", orderId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (error) {
    // The timeline table arrives with the phase 1 migration; the order page still works without it.
    console.error("[order events] could not be loaded", { orderId, error: error.message });
    return [];
  }
  return (data || []).map((e) => ({
    id: e.id as string,
    kind: e.kind as OrderEventKind,
    message: (e.message as string) || "",
    data: (e.data as Record<string, unknown>) || {},
    actorName: (e.actor_name as string | null) ?? null,
    createdAt: e.created_at as string,
  }));
}

/** When the latest timeline entry for an order was written, so changes made after it can be credited to someone. */
export async function latestEventTime(tenantId: string, orderId: string) {
  const { data } = await events().select("created_at").eq("tenant_id", tenantId).eq("order_id", orderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data?.created_at as string | undefined) ?? null;
}

/** Credits the status changes a trigger just logged (after `since`) to the person who made them. */
export async function creditTriggerEvents(tenantId: string, orderId: string, since: string | null, actor: OrderActor) {
  let query = events()
    .update({ actor_user_id: actor.userId, actor_name: actor.name })
    .eq("tenant_id", tenantId)
    .eq("order_id", orderId)
    .in("kind", ["status_changed", "paid"])
    .is("actor_name", null);
  if (since) query = query.gt("created_at", since);
  const { error } = await query;
  if (error) console.error("[order events] actor not recorded", { orderId, error: error.message });
}

/**
 * Claims the right to send one email for an order. Returns false if it was
 * already sent (or is being sent by another request). `key` is e.g.
 * "shipped", or "refunded:<refund id>" for each refund.
 */
export async function claimOrderEmail(tenantId: string, orderId: string, key: string, message: string) {
  const { data, error } = await events()
    .insert({ tenant_id: tenantId, order_id: orderId, kind: "email_sent", message, data: { email: key } })
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code !== "23505") console.error("[order events] email claim failed", { orderId, key, error: error.message });
    return null;
  }
  return (data?.id as string | undefined) ?? null;
}

/** Releases a claim when the email couldn't be sent, so a later change can try again. */
export async function releaseOrderEmail(tenantId: string, eventId: string) {
  await events().delete().eq("tenant_id", tenantId).eq("id", eventId);
}
