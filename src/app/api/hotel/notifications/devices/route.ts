import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { pushSubscriptionSchema } from "@/lib/store/push";

/** A phone or browser switching push alerts on or off for the signed-in person. */

const PostSchema = z.object({ slug: z.string().min(1), subscription: pushSubscriptionSchema });

export async function POST(req: Request) {
  try {
    const body = PostSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { error } = await auth.service
      .schema("hotel")
      .from("notification_devices")
      .upsert(
        {
          tenant_id: auth.tenant.id,
          user_id: auth.user.id,
          endpoint: body.subscription.endpoint,
          p256dh: body.subscription.keys.p256dh,
          auth: body.subscription.keys.auth,
          user_agent: req.headers.get("user-agent")?.slice(0, 300) ?? null,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,endpoint" },
      );
    if (error) return NextResponse.json({ error: "Could not save this device." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid device." }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}

const DeleteSchema = z.object({ slug: z.string().min(1), endpoint: z.string().url() });

export async function DELETE(req: Request) {
  try {
    const body = DeleteSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { error } = await auth.service
      .schema("hotel")
      .from("notification_devices")
      .delete()
      .eq("tenant_id", auth.tenant.id)
      .eq("user_id", auth.user.id)
      .eq("endpoint", body.endpoint);
    if (error) return NextResponse.json({ error: "Could not remove this device." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
