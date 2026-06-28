import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getPaystackConfig, getPaystackConfigPublic } from "@/lib/paystack/config";

const BodySchema = z.object({
  slug: z.string().min(1),
  enabled: z.boolean().optional(),
  mode: z.enum(["test", "live"]).optional(),
  publicKey: z.string().max(120).optional(),
  secretKey: z.string().max(200).optional(),
  webhookSecret: z.string().max(200).optional(),
});

const ADMIN_LIKE = new Set(["owner", "admin"]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const publicConfig = getPaystackConfigPublic(auth.tenant);
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  return NextResponse.json({
    setup: publicConfig,
    webhookUrl: `${appUrl.replace(/\/$/, "")}/api/webhooks/paystack`,
  });
}

export async function PATCH(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (!ADMIN_LIKE.has(auth.role)) {
      return NextResponse.json({ error: "Owner or admin access required." }, { status: 403 });
    }

    const existing = getPaystackConfig(auth.tenant);
    const setup = {
      enabled: body.enabled ?? existing.enabled ?? false,
      mode: body.mode ?? existing.mode ?? "test",
      publicKey: body.publicKey ?? existing.publicKey,
      ...(body.secretKey ? { secretKey: body.secretKey } : existing.secretKey ? { secretKey: existing.secretKey } : {}),
      ...(body.webhookSecret
        ? { webhookSecret: body.webhookSecret }
        : existing.webhookSecret
          ? { webhookSecret: existing.webhookSecret }
          : {}),
    };

    const { error } = await auth.service
      .from("tenants")
      .update({ paystack_setup: setup })
      .eq("id", auth.tenant.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, setup: getPaystackConfigPublic({ paystack_setup: setup }) });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
