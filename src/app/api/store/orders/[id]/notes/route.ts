import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { recordOrderEvent } from "@/lib/store/order-events";

const noteSchema = z.object({ slug: z.string(), message: z.string().trim().min(1).max(2000) });

/** POST /api/store/orders/<id>/notes { slug, message } — a private note on the order's timeline. Any team member. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  const parsed = noteSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Write a note of up to 2,000 characters." }, { status: 400 });

  const { tenantId, userId, currentUserName } = resolved.access;
  const { data: order } = await resolved.service.schema("store").from("orders").select("id").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

  const ok = await recordOrderEvent(tenantId, id, { kind: "note", message: parsed.data.message }, { userId, name: currentUserName });
  if (!ok) return NextResponse.json({ error: "We couldn't save your note. Please try again." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
