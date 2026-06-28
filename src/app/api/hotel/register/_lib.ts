import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const HotelSendOtpSchema = z.object({
  hotel_name: z.string().min(1),
  contact_email: z.string().email(),
  contact_phone: z.string().min(1),
  country: z.string().min(1),
  city: z.string().min(1),
  address: z.string().min(1),
  room_count: z.string().min(1),
  hotel_type: z.string().min(1),
  agreed: z.boolean(),
});

export const VerifyOtpSchema = z.object({ tenant_id: z.string().min(1), code: z.string().length(6) });
export const SaveDetailsSchema = z.object({
  tenant_id: z.string().uuid(),
  contact_name: z.string().optional(),
  contact_email: z.string().email(),
  contact_phone: z.string().min(1),
  country: z.string().min(1),
  city: z.string().min(1),
  address: z.string().min(1),
  room_count: z.string().min(1),
  hotel_type: z.string().min(1),
  password: z.string().min(8),
});
export const BillingSchema = z.object({ tenant_id: z.string().min(1), plan: z.enum(["monthly", "quarterly", "yearly"]) });
export const VerifyPaymentSchema = z.object({ reference: z.string().min(1) });

export function validationError(error: unknown) {
  return NextResponse.json({ error: "Invalid payload", detail: error }, { status: 400 });
}

export async function assertHotelScope(tenantId: string) {
  return assertTenantProductScope(tenantId, "hotel");
}

export async function assertTenantProductScope(tenantId: string, product: "hotel" | "store") {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("tenants").select("id,product").eq("id", tenantId).single();
  if (error) throw new Error("Unable to validate tenant scope.");
  if (!data) throw new Error("Tenant not found.");
  if (data.product !== product) throw new Error(`Tenant is not ${product} scoped.`);
}

export function generateOtpCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function hashOtp(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

export function isStrongPassword(password: string) {
  return password.length >= 8 && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
}

export function createMaskedEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const head = local.slice(0, 2);
  const tail = local.slice(-1);
  return `${head}${"*".repeat(Math.max(local.length - 3, 1))}${tail}@${domain}`;
}

export function apiError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function getLatestActiveOtp({
  tenantId,
  email,
}: {
  tenantId: string;
  email: string;
}) {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .schema("hotel")
    .from("registration_otps")
    .select("id, otp_hash, expires_at, attempts, consumed_at")
    .eq("tenant_id", tenantId)
    .eq("email", email)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export function assertOtpNotExpired(expiresAt: string) {
  if (new Date(expiresAt).getTime() < Date.now()) {
    throw new Error("Verification code has expired.");
  }
}
