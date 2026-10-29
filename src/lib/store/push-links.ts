import { createServerSupabaseClient } from "@/lib/supabase/server";
import { deliverPush, getPushConfig } from "./push";

/*
 * Notifications about something a shopper asked to hear about on their device:
 * their order moving on, the basket they left, a product back in stock. Each is
 * linked to the device it was asked from (store.push_links), so nobody else's
 * order or basket can ever reach it. Nothing here throws: a notification that
 * can't go out never stops the order, email or sweep that sent it.
 */

export type PushLinkKind = "order" | "checkout" | "stock_alert";

const store = () => createServerSupabaseClient().schema("store");

/** Links a device this shop already knows (by its push address) to an order, basket or request. */
export async function linkPushDevice(tenantId: string, endpoint: string, kind: PushLinkKind, refId: string) {
  try {
    const { data: device } = await store().from("push_subscriptions").select("id").eq("tenant_id", tenantId).eq("endpoint", endpoint).maybeSingle();
    if (!device) return false;
    const { error } = await store()
      .from("push_links")
      .upsert({ tenant_id: tenantId, subscription_id: device.id, kind, ref_id: refId }, { onConflict: "subscription_id,kind,ref_id", ignoreDuplicates: true });
    if (error) {
      console.error("[push links] not linked", { kind, error: error.message });
      return false;
    }
    return true;
  } catch (err) {
    console.error("[push links] not linked", err);
    return false;
  }
}

export type LinkedPush = {
  title: string;
  body: string;
  /** A page in the shop, e.g. "/products/mug". */
  path: string;
  /** Replaces an earlier notification with the same tag on the device. */
  tag: string;
};

/** Sends to every device linked to this order, basket or request. Returns how many it reached. */
export async function sendLinkedPush(tenantId: string, kind: PushLinkKind, refId: string, message: LinkedPush): Promise<number> {
  if (!getPushConfig()) return 0;
  try {
    const { data, error } = await store()
      .from("push_links")
      .select("device:subscription_id(id, endpoint, p256dh, auth)")
      .eq("tenant_id", tenantId)
      .eq("kind", kind)
      .eq("ref_id", refId)
      .limit(20);
    if (error) {
      // Before the migration has run there are no links to send to.
      if (error.code !== "42P01" && error.code !== "PGRST205") console.error("[push links] lookup failed", error.message);
      return 0;
    }
    const devices = (data || []).map((r) => r.device as unknown as { id: string; endpoint: string; p256dh: string; auth: string } | null).filter((d) => d !== null);
    if (!devices.length) return 0;
    const payload = JSON.stringify({ title: message.title.slice(0, 80), body: message.body.slice(0, 200), path: message.path, icon: "app-icon/192", badge: "app-icon/badge", tag: message.tag });
    const result = await deliverPush(devices, payload, kind === "order" ? "high" : "normal");
    return result.delivered;
  } catch (err) {
    console.error("[push links] not sent", err);
    return 0;
  }
}
