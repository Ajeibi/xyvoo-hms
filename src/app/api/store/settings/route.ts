import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveStoreRequest } from "@/lib/store/api-helpers";

const PaystackSetupSchema = z.object({
  enabled: z.boolean(),
  mode: z.enum(["test", "live"]),
  publicKey: z.string().trim(),
  secretKey: z.string().trim(),
  webhookSecret: z.string().trim(),
});

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug") || "";
  const resolved = await resolveStoreRequest(slug);
  if (resolved.error) return resolved.error;

  const { data, error } = await resolved.service
    .from("tenants")
    .select("paystack_setup")
    .eq("id", resolved.access.tenantId)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ paystackSetup: data.paystack_setup || {} });
}

export async function PATCH(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug") || "";
  const resolved = await resolveStoreRequest(slug);
  if (resolved.error) return resolved.error;

  if (!resolved.capabilities.canManageSettings) {
    return NextResponse.json({ error: "You don't have permission to change storefront settings." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PaystackSetupSchema.safeParse(body?.paystackSetup);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid payment settings." },
      { status: 400 },
    );
  }

  const { error } = await resolved.service
    .from("tenants")
    .update({ paystack_setup: parsed.data })
    .eq("id", resolved.access.tenantId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ success: true });
}
