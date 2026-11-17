import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { pinOwner } from "@/lib/hms/approvals";
import { hashPin, isValidPin } from "@/lib/hms/pin";
import { recordAudit } from "@/lib/hms/audit";

const Schema = z.object({ slug: z.string().min(1), pin: z.string().refine(isValidPin, "Use 4 to 6 digits.") });

/** Anyone in the hotel sets their own PIN: to take the keys on a shared screen and, for heads, to approve staff actions. */
export async function POST(req: Request) {
  try {
    const body = Schema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    // One PIN, one person: otherwise a PIN couldn't say who approved.
    if (await pinOwner(auth.service, auth.tenant.id, body.pin, auth.user.id)) {
      return NextResponse.json({ error: "Someone else already uses that PIN. Choose another." }, { status: 409 });
    }

    const { error } = await auth.service
      .schema("hotel")
      .from("memberships")
      .update({ pin_hash: hashPin(body.pin), pin_failed_count: 0, pin_locked_at: null })
      .eq("tenant_id", auth.tenant.id)
      .eq("user_id", auth.user.id);
    if (error) return NextResponse.json({ error: error.message || "Unable to save the PIN." }, { status: 400 });

    await recordAudit(auth.service, { tenantId: auth.tenant.id, action: "staff_pin_set", entityType: "staff_login", entityId: auth.user.id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid input." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to save the PIN." }, { status: 500 });
  }
}
