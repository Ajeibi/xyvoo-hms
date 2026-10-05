import { NextResponse } from "next/server";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { storeDetailsSchema, type StoreDetails } from "@/lib/store/store-details";

/** GET /api/store/profile?slug= — store details for Settings. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;

  const { data } = await resolved.service
    .schema("store")
    .from("business_profile")
    .select("category, business_email, phone, whatsapp, address_line1, city, state, socials")
    .eq("tenant_id", resolved.access.tenantId)
    .maybeSingle();
  const socials = (data?.socials as Record<string, string> | null) ?? {};

  const details: Partial<StoreDetails> & { category: string | null } = {
    storeName: resolved.access.storeDisplayName,
    category: data?.category ?? null,
    businessEmail: data?.business_email ?? "",
    phone: data?.phone ?? "",
    whatsapp: data?.whatsapp ?? "",
    addressLine1: data?.address_line1 ?? "",
    city: data?.city ?? "",
    state: data?.state ?? "",
    instagram: socials.instagram ?? "",
    facebook: socials.facebook ?? "",
    tiktok: socials.tiktok ?? "",
  };
  return NextResponse.json({ details, canManage: resolved.capabilities.canManageSettings });
}

/** PATCH /api/store/profile { slug, ...details } — owner or admin. */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return NextResponse.json({ error: "Only the owner or an admin can change store details." }, { status: 403 });

  const parsed = storeDetailsSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return NextResponse.json({ error: issue?.message || "Check the details.", field: issue?.path.join(".") }, { status: 400 });
  }
  const v = parsed.data;
  const socials = Object.fromEntries((["instagram", "facebook", "tiktok"] as const).filter((k) => v[k]).map((k) => [k, v[k]]));

  const [tenantResult, profileResult] = await Promise.all([
    resolved.service.from("tenants").update({ display_name: v.storeName }).eq("id", resolved.access.tenantId),
    resolved.service
      .schema("store")
      .from("business_profile")
      .update({
        category: v.category,
        business_email: v.businessEmail,
        phone: v.phone,
        whatsapp: v.whatsapp || null,
        address_line1: v.addressLine1,
        city: v.city,
        state: v.state,
        socials,
      })
      .eq("tenant_id", resolved.access.tenantId),
  ]);
  const error = tenantResult.error || profileResult.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
