import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { storeSubdomainSchema } from "@/lib/store/subdomain";
import { rateLimit } from "@/lib/rate-limit";

/**
 * GET /api/store/subdomain-check?slug=<current store>&candidate=<address>
 * Lets a store owner check whether a web address is free while typing in the
 * onboarding wizard. Signed-in members only, and rate-limited per user.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const resolved = await resolveStoreRequest(url.searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { access, service } = resolved;

  if (!rateLimit(`subdomain-check:${access.userId}`, 60, 60_000).ok) {
    return NextResponse.json({ error: "Too many checks. Please wait a moment." }, { status: 429 });
  }

  const parsed = storeSubdomainSchema.safeParse(url.searchParams.get("candidate") || "");
  if (!parsed.success) return NextResponse.json({ available: false, reason: parsed.error.issues[0]?.message });

  const candidate = parsed.data;
  const { data } = await service
    .from("tenants")
    .select("id")
    .or(`subdomain.eq.${candidate},name.eq.${candidate}`)
    .neq("id", access.tenantId)
    .limit(1);

  return NextResponse.json(data?.length ? { available: false, reason: "That address is already taken." } : { available: true });
}
