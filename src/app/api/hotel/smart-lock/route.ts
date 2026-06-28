import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";

const BodySchema = z.object({
  slug: z.string().min(1),
  provider: z.enum(["audit_only", "mock", "http_webhook"]),
  apiBaseUrl: z.string().url().optional().or(z.literal("")),
  apiKey: z.string().max(200).optional(),
});

export async function GET(req: Request) {
  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const setup = (auth.tenant as { smart_lock_setup?: unknown }).smart_lock_setup ?? {};
  return NextResponse.json({ setup });
}

export async function PATCH(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const caps = getRoomsCapabilities(auth.role);
    if (!caps.canRemoteUnlock) {
      return NextResponse.json({ error: "Manager access required." }, { status: 403 });
    }

    const setup = {
      provider: body.provider,
      apiBaseUrl: body.apiBaseUrl || undefined,
      ...(body.apiKey ? { apiKey: body.apiKey } : {}),
    };

    const { error } = await auth.service
      .from("tenants")
      .update({ smart_lock_setup: setup })
      .eq("id", auth.tenant.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, setup });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to save." }, { status: 500 });
  }
}
