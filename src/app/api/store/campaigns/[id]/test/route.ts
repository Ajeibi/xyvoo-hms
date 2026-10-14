import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { CampaignError, sendTestCampaign } from "@/lib/store/campaigns-server";
import { rateLimitShared } from "@/lib/rate-limit";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

/** POST /api/store/campaigns/:id/test { slug } — emails a test copy to the signed-in person's own address. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can send email campaigns." }, { status: 403 });
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "That campaign can't be found." }, { status: 404 });
  if (!(await rateLimitShared(`campaign-test:${resolved.access.userId}`, 10, 60 * 60_000)).ok) {
    return NextResponse.json({ error: "You've sent a few tests already. Please try again in a little while." }, { status: 429 });
  }

  const auth = await createSupabaseAuthServerClient();
  const email = (await auth.auth.getUser()).data.user?.email;
  if (!email) return NextResponse.json({ error: "We couldn't find your email address." }, { status: 400 });
  try {
    await sendTestCampaign(resolved.access.tenantId, id, email);
    return NextResponse.json({ sentTo: email });
  } catch (error) {
    if (error instanceof CampaignError) return NextResponse.json({ error: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 409 });
    console.error("[campaigns] test failed", error);
    return NextResponse.json({ error: "We couldn't send the test just now. Please try again." }, { status: 500 });
  }
}
