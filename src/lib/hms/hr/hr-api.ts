import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireHotelApiSection } from "@/lib/hms/hotel-api-auth";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

type Member = Exclude<Awaited<ReturnType<typeof requireHotelApiSection>>, { error: string }>;

export type HrActor = { userId: string; name: string | null };

export type HrAuth = {
  auth: Member;
  actor: HrActor;
  isOwner: boolean;
  /**
   * The caller's own database client. Pay and personal details are read and written only
   * through this, so row-level security (hotel.hr_can_see_private) decides who sees them.
   */
  privateDb: SupabaseClient;
};

/** The signed-in user's client, for HR private tables. */
export async function privateHrClient(): Promise<SupabaseClient> {
  return (await createSupabaseAuthServerClient()) as unknown as SupabaseClient;
}

/** Asks the database whether the signed-in user may see pay and personal details for a hotel. */
export async function canSeeHrPrivate(privateDb: SupabaseClient, tenantId: string): Promise<boolean> {
  const { data, error } = await privateDb.schema("hotel").rpc("hr_can_see_private", { p_tenant: tenantId });
  if (error) return false;
  return data === true;
}

/** Signs the caller in to a hotel's HR routes: owners, full-access managers and the HR login. */
export async function authHr(slug: string | null): Promise<HrAuth | NextResponse> {
  if (!slug) return NextResponse.json({ error: "slug is required." }, { status: 400 });
  const auth = await requireHotelApiSection(slug, ["hr"]);
  if ("error" in auth) {
    const message = auth.status === 403 ? "Your role can't use HR. Ask a manager." : auth.error;
    return NextResponse.json({ error: message }, { status: auth.status });
  }
  const meta = (auth.user.user_metadata ?? {}) as Record<string, unknown>;
  const name =
    (typeof meta.full_name === "string" && meta.full_name) || (typeof meta.name === "string" && meta.name) || auth.user.email || null;
  return {
    auth,
    actor: { userId: auth.user.id, name },
    isOwner: auth.role === "owner",
    privateDb: await privateHrClient(),
  };
}

export function isFailure(v: HrAuth | NextResponse): v is NextResponse {
  return v instanceof NextResponse;
}

export function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
