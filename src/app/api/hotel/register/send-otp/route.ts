import { NextResponse } from "next/server";
import { sendRegistrationOtpEmail } from "@/lib/mail/mailtrap";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { HotelSendOtpSchema, apiError, createMaskedEmail, generateOtpCode, hashOtp, validationError } from "../_lib";

function createTenantSubdomain(hotelName: string) {
  return hotelName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 45);
}

export async function POST(req: Request) {
  try {
    const parsed = HotelSendOtpSchema.parse(await req.json());
    const supabase = createServerSupabaseClient();

    let tenantId: string | null = null;

    const { data: existingSession } = await supabase
      .schema("hotel")
      .from("registration_sessions")
      .select("tenant_id")
      .eq("contact_email", parsed.contact_email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingSession?.tenant_id) {
      tenantId = existingSession.tenant_id;
    } else {
      const generatedId = crypto.randomUUID();
      const baseSubdomain = createTenantSubdomain(parsed.hotel_name) || `hotel-${generatedId.slice(0, 8)}`;
      let subdomain = baseSubdomain;

      for (let i = 0; i < 6; i++) {
        const { data: subdomainMatch } = await supabase.from("tenants").select("id").eq("subdomain", subdomain).maybeSingle();
        if (!subdomainMatch) break;
        subdomain = `${baseSubdomain}-${Math.floor(100 + Math.random() * 900)}`;
      }

      const { data: insertedTenant, error: tenantError } = await supabase
        .from("tenants")
        .insert({
          id: generatedId,
          subdomain,
          name: subdomain,
          display_name: parsed.hotel_name,
          product: "hotel",
        })
        .select("id")
        .single();

      if (tenantError) {
        return apiError(`Unable to create tenant. ${tenantError.message}`);
      }

      tenantId = insertedTenant.id;
    }

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const otpCode = generateOtpCode();
    const otpHash = hashOtp(otpCode);

    const { error: otpError } = await supabase.schema("hotel").from("registration_otps").insert({
      tenant_id: tenantId,
      email: parsed.contact_email,
      otp_hash: otpHash,
      expires_at: expiresAt,
    });

    if (otpError) return apiError(`Unable to create OTP. ${otpError.message}`);

    const { error: sessionError } = await supabase.schema("hotel").from("registration_sessions").upsert(
      {
        tenant_id: tenantId,
        contact_email: parsed.contact_email,
        step: "hotel_details",
        metadata: {
          hotel_name: parsed.hotel_name,
          contact_phone: parsed.contact_phone,
          country: parsed.country,
          city: parsed.city,
          address: parsed.address,
          room_count: parsed.room_count,
          hotel_type: parsed.hotel_type,
        },
      },
      { onConflict: "tenant_id" },
    );

    if (sessionError) return apiError(`Unable to persist registration session. ${sessionError.message}`);

    await sendRegistrationOtpEmail({
      to: parsed.contact_email,
      hotelName: parsed.hotel_name,
      otpCode,
    });

    return NextResponse.json({
      tenant_id: tenantId,
      expires_at: expiresAt,
      email_hint: createMaskedEmail(parsed.contact_email),
    });
  } catch (error) {
    if (error instanceof Error) return apiError(error.message, 500);
    return validationError(error);
  }
}
