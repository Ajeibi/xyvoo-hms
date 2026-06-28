import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  VerifyOtpSchema,
  apiError,
  assertHotelScope,
  assertOtpNotExpired,
  getLatestActiveOtp,
  hashOtp,
  validationError,
} from "../_lib";

export async function POST(req: Request) {
  try {
    const parsed = VerifyOtpSchema.parse(await req.json());
    await assertHotelScope(parsed.tenant_id);
    const supabase = createServerSupabaseClient();

    const { data: session, error: sessionError } = await supabase
      .schema("hotel")
      .from("registration_sessions")
      .select("contact_email")
      .eq("tenant_id", parsed.tenant_id)
      .single();

    if (sessionError || !session) return apiError("Registration session not found.");

    const otp = await getLatestActiveOtp({
      tenantId: parsed.tenant_id,
      email: session.contact_email,
    });

    if (!otp) return apiError("No active verification code found.");
    if (otp.attempts >= 5) return apiError("Too many invalid attempts. Please request another code.");

    assertOtpNotExpired(otp.expires_at);

    const submittedHash = hashOtp(parsed.code);
    if (submittedHash !== otp.otp_hash) {
      await supabase
        .schema("hotel")
        .from("registration_otps")
        .update({ attempts: (otp.attempts ?? 0) + 1 })
        .eq("id", otp.id);

      return apiError("Invalid verification code.");
    }

    await supabase
      .schema("hotel")
      .from("registration_otps")
      .update({ consumed_at: new Date().toISOString() })
      .eq("id", otp.id);

    await supabase
      .schema("hotel")
      .from("registration_sessions")
      .update({ verified_at: new Date().toISOString(), step: "otp_verified" })
      .eq("tenant_id", parsed.tenant_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error) return apiError(error.message);
    return validationError(error);
  }
}
