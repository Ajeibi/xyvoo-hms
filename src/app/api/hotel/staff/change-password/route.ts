import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { pinOwner } from "@/lib/hms/approvals";
import { hashPin } from "@/lib/hms/pin";

const Schema = z.object({
  password: z.string().min(8, "Use at least 8 characters.").max(72),
  /** Their own 4-6 digit PIN, for taking the keys on a shared screen. Staff must choose one. */
  pin: z.string().regex(/^\d{4,6}$/, "The PIN is 4 to 6 digits.").optional().or(z.literal("")),
});

/**
 * The signed-in person replaces their own (temporary) password. This is the only route a login with
 * must_change_password can use; it clears the flag on every hotel the login belongs to.
 */
export async function POST(req: Request) {
  try {
    const authClient = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { password, pin } = Schema.parse(await req.json());
    const service = createServerSupabaseClient();

    // A suspended login can't change anything.
    const { data: rows } = await service.schema("hotel").from("memberships").select("status").eq("user_id", user.id);
    if ((rows ?? []).some((r) => (r as { status?: string }).status === "suspended")) {
      return NextResponse.json({ error: "This login is suspended." }, { status: 403 });
    }

    // Staff need a PIN to switch in on a shared screen, and each PIN belongs to one person in a hotel.
    const { data: mine } = await service.schema("hotel").from("memberships").select("tenant_id, staff_level, pin_hash").eq("user_id", user.id);
    const needsPin = (mine ?? []).some((m) => (m as { staff_level?: string }).staff_level === "staff" && !(m as { pin_hash?: string | null }).pin_hash);
    if (needsPin && !pin) return NextResponse.json({ error: "Choose a 4 to 6 digit PIN too." }, { status: 400 });
    if (pin) {
      for (const m of mine ?? []) {
        if (await pinOwner(service, (m as { tenant_id: string }).tenant_id, pin, user.id)) {
          return NextResponse.json({ error: "Someone else already uses that PIN. Choose another." }, { status: 409 });
        }
      }
    }

    const { error } = await service.auth.admin.updateUserById(user.id, { password });
    if (error) return NextResponse.json({ error: error.message || "Unable to change the password." }, { status: 400 });

    await service
      .schema("hotel")
      .from("memberships")
      .update({ must_change_password: false, ...(pin ? { pin_hash: hashPin(pin), pin_failed_count: 0, pin_locked_at: null } : {}) })
      .eq("user_id", user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid input." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unable to change the password." }, { status: 500 });
  }
}
