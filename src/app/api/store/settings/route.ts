import { shopTenantChanged } from "@/lib/store/site/shop-changed";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { diffFields, logActivity } from "@/lib/store/activity";

const PaystackSetupSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["test", "live"]),
  publicKey: z.string().trim().max(200),
  secretKey: z.string().trim().max(200),
  webhookSecret: z.string().trim().max(200),
});

type PaystackSetup = z.infer<typeof PaystackSetupSchema>;

/** Secrets never leave the server whole: "sk_live_••••abcd". A masked value sent back means "unchanged". */
const MASK = "••••";
const mask = (value: string | undefined) => (value ? `${value.slice(0, 8)}${MASK}${value.slice(-4)}` : "");
const isMasked = (value: string) => value.includes(MASK);

function forbidden() {
  return NextResponse.json({ error: "Only the store owner or an admin can see or change payment keys." }, { status: 403 });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const resolved = await resolveStoreRequest(searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return forbidden();

  const { data, error } = await resolved.service.from("tenants").select("paystack_setup").eq("id", resolved.access.tenantId).single();
  if (error) return NextResponse.json({ error: "We couldn't load your payment settings." }, { status: 400 });

  const setup = (data.paystack_setup || {}) as Partial<PaystackSetup>;
  return NextResponse.json({
    paystackSetup: { ...setup, secretKey: mask(setup.secretKey), webhookSecret: mask(setup.webhookSecret) },
  });
}

export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const slug = new URL(req.url).searchParams.get("slug") || (typeof body?.slug === "string" ? body.slug : "");
  const resolved = await resolveStoreRequest(slug);
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return forbidden();

  const parsed = PaystackSetupSchema.safeParse(body?.paystackSetup);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid payment settings." }, { status: 400 });
  }

  // Keep the stored secret wherever the form sent back its masked version.
  const { data: current } = await resolved.service.from("tenants").select("paystack_setup").eq("id", resolved.access.tenantId).single();
  const stored = (current?.paystack_setup || {}) as Partial<PaystackSetup>;
  const next: PaystackSetup = {
    ...parsed.data,
    secretKey: isMasked(parsed.data.secretKey) ? stored.secretKey || "" : parsed.data.secretKey,
    webhookSecret: isMasked(parsed.data.webhookSecret) ? stored.webhookSecret || "" : parsed.data.webhookSecret,
  };

  const { error } = await resolved.service.from("tenants").update({ paystack_setup: next }).eq("id", resolved.access.tenantId);
  if (error) return NextResponse.json({ error: "We couldn't save your payment settings." }, { status: 400 });

  // Which settings changed, never the keys themselves.
  await logActivity({
    tenantId: resolved.access.tenantId,
    actor: resolved.access,
    area: "settings",
    action: "paystack_keys_updated",
    changes: diffFields({ enabled: stored.enabled, mode: stored.mode }, { enabled: next.enabled, mode: next.mode }),
  });
  // Whether the shop takes cards may have changed.
  shopTenantChanged(resolved.access.tenantId);
  return NextResponse.json({ success: true });
}
