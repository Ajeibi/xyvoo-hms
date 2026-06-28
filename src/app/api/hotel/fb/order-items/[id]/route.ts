import { NextResponse } from "next/server";
import { z } from "zod";
import { updateOrderItemKitchenStatus } from "@/lib/hms/fb-orders";
import type { FbKitchenStatus } from "@/lib/hms/fb-types";
import { fbForbidden, requireFbApi } from "../../_lib";

const PatchSchema = z.object({
  slug: z.string().min(1),
  kitchenStatus: z.enum(["pending", "preparing", "ready", "served", "voided"]),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = PatchSchema.parse(await req.json());
    const auth = await requireFbApi(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const denied = fbForbidden(auth.capabilities, "canUpdateKitchenStatus");
    if (denied) return NextResponse.json({ error: denied.error }, { status: denied.status });

    const result = await updateOrderItemKitchenStatus(
      auth.service,
      auth.tenant.id,
      id,
      body.kitchenStatus as FbKitchenStatus,
    );
    if (result.error) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, item: result.item });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
