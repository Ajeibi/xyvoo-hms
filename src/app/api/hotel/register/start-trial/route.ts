import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { BillingSchema, apiError, assertHotelScope, validationError } from "../_lib";

export async function POST(req: Request) {
  try {
    const parsed = BillingSchema.parse(await req.json());
    await assertHotelScope(parsed.tenant_id);

    const supabase = createServerSupabaseClient();
    const now = new Date();
    const trialEnds = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const { data: membership, error: membershipError } = await supabase
      .schema("hotel")
      .from("memberships")
      .select("user_id")
      .eq("tenant_id", parsed.tenant_id)
      .eq("role", "owner")
      .limit(1)
      .maybeSingle();

    if (membershipError || !membership) return apiError("Owner membership not found.");

    const { error: profileError } = await supabase
      .schema("hotel")
      .from("profiles")
      .update({
        trial_starts_at: now.toISOString(),
        trial_ends_at: trialEnds.toISOString(),
      })
      .eq("tenant_id", parsed.tenant_id)
      .eq("user_id", membership.user_id);

    if (profileError) return apiError("Unable to start trial.");

    await supabase
      .schema("hotel")
      .from("registration_sessions")
      .update({
        step: "trial_started",
        metadata: {
          billing_plan: parsed.plan,
        },
      })
      .eq("tenant_id", parsed.tenant_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    return validationError(error);
  }
}
