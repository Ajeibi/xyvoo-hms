import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SaveDetailsSchema, apiError, assertHotelScope, isStrongPassword, validationError } from "../_lib";

export async function POST(req: Request) {
  try {
    const parsed = SaveDetailsSchema.parse(await req.json());
    await assertHotelScope(parsed.tenant_id);
    const supabase = createServerSupabaseClient();

    const { data: session, error: sessionError } = await supabase
      .schema("hotel")
      .from("registration_sessions")
      .select("verified_at")
      .eq("tenant_id", parsed.tenant_id)
      .single();

    if (sessionError || !session) return apiError("Registration session not found.");
    if (!session.verified_at) return apiError("Please verify your email first.");
    if (!isStrongPassword(parsed.password)) return apiError("Password is too weak.");

    const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
      email: parsed.contact_email,
      password: parsed.password,
      email_confirm: true,
      user_metadata: {
        full_name: parsed.contact_name || parsed.hotel_type,
      },
    });

    if (createUserError || !createdUser.user) {
      return apiError(createUserError?.message || "Unable to create account.");
    }

    const { error: profileError } = await supabase.schema("hotel").from("profiles").upsert(
      {
        tenant_id: parsed.tenant_id,
        user_id: createdUser.user.id,
        contact_name: parsed.contact_name || "",
        contact_phone: parsed.contact_phone,
        country: parsed.country,
        city: parsed.city,
        address: parsed.address,
        room_count: Number(parsed.room_count || 0),
        hotel_type: parsed.hotel_type,
      },
      { onConflict: "user_id" },
    );

    if (profileError) return apiError("Unable to save hotel profile.");

    const { error: membershipError } = await supabase.schema("hotel").from("memberships").upsert(
      {
        tenant_id: parsed.tenant_id,
        user_id: createdUser.user.id,
        role: "owner",
      },
      { onConflict: "tenant_id,user_id" },
    );

    if (membershipError) return apiError("Unable to assign owner membership.");

    await supabase
      .schema("hotel")
      .from("registration_sessions")
      .update({ step: "account_saved" })
      .eq("tenant_id", parsed.tenant_id);

    return NextResponse.json({ success: true, user_id: createdUser.user.id, login_url: "/auth/login?registered=1" });
  } catch (error) {
    return validationError(error);
  }
}
