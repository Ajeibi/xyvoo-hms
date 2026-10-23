import { NextResponse } from "next/server";
import { badge, detailsPanel } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/*
 * Settings that decide where a shop's money goes: the payout bank account and
 * the shop's own Paystack keys. Only the owner can change them, and the owner
 * is told by email every time they change, at their own sign-in address (not
 * the shop's contact email, which an admin can edit).
 */

export const OWNER_ONLY_MONEY = "Only the shop owner can change where your shop's money is paid. Ask the owner to make this change.";

/** A 403 for anyone but the owner, or null for the owner. */
export function ownerOnlyMoney(role: string | null) {
  return role === "owner" ? null : NextResponse.json({ error: OWNER_ONLY_MONEY }, { status: 403 });
}

/** Emails the owner that a money setting changed, and who changed it. Never throws. */
export async function alertOwnerMoneyChange(tenantId: string, changedBy: string, change: { title: string; detail: string; rows: { label: string; value: string }[] }) {
  try {
    const db = createServerSupabaseClient();
    const [{ data: owner }, { data: tenant }] = await Promise.all([
      db.schema("store").from("memberships").select("user_id").eq("tenant_id", tenantId).eq("role", "owner").limit(1).maybeSingle(),
      db.from("tenants").select("subdomain, name, display_name").eq("id", tenantId).maybeSingle(),
    ]);
    if (!owner) return;
    const [{ data: ownerUser }, { data: byUser }] = await Promise.all([db.auth.admin.getUserById(owner.user_id as string), db.auth.admin.getUserById(changedBy)]);
    const to = ownerUser.user?.email;
    if (!to) return;
    const storeName = (tenant?.display_name as string | null)?.trim() || String(tenant?.subdomain || tenant?.name || "your shop");
    const who = changedBy === owner.user_id ? "You" : byUser.user?.email || "A member of your team";
    const when = new Date().toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" });
    const rows = [{ label: "Changed by", value: who }, { label: "When", value: `${when} (Lagos time)` }, ...change.rows];
    const warning = "If you didn't expect this, sign in and check your payment settings straight away, and contact XYVOO support.";
    await sendBrandedEmail({
      to,
      subject: `${change.title} for ${storeName}`,
      text: [`${change.detail}`, "", ...rows.map((r) => `${r.label}: ${r.value}`), "", warning].join("\n"),
      layout: {
        preheader: change.detail.slice(0, 110),
        badges: [badge("Security", "amber")],
        title: change.title,
        intro: change.detail,
        body: `${detailsPanel(rows)}<p style="margin:20px 0 0;color:#1e293b;font-size:15px;line-height:1.6">${warning}</p>`,
        footerNote: `You're receiving this because you own ${storeName} on XYVOO. We send it whenever your payment settings change.`,
      },
    });
  } catch (error) {
    console.error("[money settings] owner not told", { tenantId, error });
  }
}
