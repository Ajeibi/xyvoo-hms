import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import {
  changeStoreSlug,
  checkSlugAvailable,
  listPreviousAddresses,
  MAX_SLUG_CHANGES_PER_30_DAYS,
  slugChangesInLast30Days,
} from "@/lib/store/slugs";
import { storefrontUrl, storeSubdomainSchema } from "@/lib/store/subdomain";
import { rateLimit } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function currentSlug(service: ReturnType<typeof createServerSupabaseClient>, tenantId: string) {
  const { data } = await service.from("tenants").select("subdomain, name").eq("id", tenantId).maybeSingle();
  return ((data?.subdomain as string | null) || (data?.name as string | null) || "").toLowerCase();
}

/** GET /api/store/domain?slug= — the store's web address and old addresses that still redirect. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  const { access, service, capabilities } = resolved;

  const [slug, previous] = await Promise.all([currentSlug(service, access.tenantId), listPreviousAddresses(access.tenantId).catch(() => [])]);
  return NextResponse.json({
    slug,
    url: storefrontUrl(slug),
    previous,
    changesLeft: Math.max(0, MAX_SLUG_CHANGES_PER_30_DAYS - slugChangesInLast30Days(previous)),
    canManage: capabilities.canManageSettings,
  });
}

/**
 * POST /api/store/domain { slug, newSlug } — owner or admin. Moves the store to
 * a new address; the old one redirects there for 90 days.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  const { access, service, capabilities } = resolved;
  if (!capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can change the web address." }, { status: 403 });
  if (!rateLimit(`store-domain:${access.userId}`, 10, 60 * 60_000).ok) {
    return NextResponse.json({ error: "Too many attempts. Please try again in an hour." }, { status: 429 });
  }

  const parsed = storeSubdomainSchema.safeParse(typeof body?.newSlug === "string" ? body.newSlug.trim().toLowerCase() : "");
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the web address." }, { status: 400 });
  const newSlug = parsed.data;

  const oldSlug = await currentSlug(service, access.tenantId);
  if (newSlug === oldSlug) return NextResponse.json({ error: "That's already your web address." }, { status: 400 });

  const previous = await listPreviousAddresses(access.tenantId);
  if (slugChangesInLast30Days(previous) >= MAX_SLUG_CHANGES_PER_30_DAYS) {
    return NextResponse.json(
      { error: `You can change your web address ${MAX_SLUG_CHANGES_PER_30_DAYS} times in 30 days. Please try again later, or contact us if you need help.` },
      { status: 400 },
    );
  }

  const check = await checkSlugAvailable(newSlug, access.tenantId, service);
  if (!check.available) return NextResponse.json({ error: check.reason }, { status: 409 });

  await changeStoreSlug(access.tenantId, oldSlug, newSlug);
  return NextResponse.json({ slug: newSlug, url: storefrontUrl(newSlug) });
}
