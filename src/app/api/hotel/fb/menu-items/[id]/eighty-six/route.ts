import { NextResponse } from "next/server";
import { z } from "zod";
import { eightySixMenuItem } from "@/lib/hms/fb-orders";
import { fbForbidden, requireFbApi } from "../../../_lib";

const BodySchema = z.object({
  slug: z.string().min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = BodySchema.parse(await req.json());
    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const denied = fbForbidden(auth.capabilities, "canEightySix");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    const result = await eightySixMenuItem(auth.service, auth.tenant.id, id, auth.user.id);
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
