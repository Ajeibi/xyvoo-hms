import { NextResponse } from "next/server";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";

const ADMIN_LIKE_ROLES = new Set(["owner", "admin"]);
const BRANDING_BUCKET = "tenant-assets";

async function canManageBranding(tenantId: string, userId: string) {
  const service = createServerSupabaseClient();
  const { data: membership } = await service
    .schema("hotel")
    .from("memberships")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(membership && ADMIN_LIKE_ROLES.has(membership.role));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug") || "";
  if (!slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 });

  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

  const service = createServerSupabaseClient();
  const { data: adminMemberships } = await service
    .schema("hotel")
    .from("memberships")
    .select("user_id, role, created_at")
    .eq("tenant_id", tenant.id)
    .in("role", ["owner", "admin"])
    .order("created_at", { ascending: true });

  const orderedMemberships = (adminMemberships || []).sort((a, b) => {
    if (a.role === b.role) return 0;
    return a.role === "owner" ? -1 : 1;
  });

  const adminUserIds = orderedMemberships.map((membership) => membership.user_id);
  let superAdminName: string | null = null;

  if (adminUserIds.length) {
    const { data: adminProfiles } = await service
      .schema("hotel")
      .from("profiles")
      .select("user_id, contact_name")
      .in("user_id", adminUserIds);

    const contactNameByUserId = new Map(
      (adminProfiles || []).map((profile) => [profile.user_id, profile.contact_name]),
    );

    superAdminName =
      orderedMemberships
        .map((membership) => contactNameByUserId.get(membership.user_id)?.trim())
        .find(Boolean) || null;
  }

  return NextResponse.json({
    display_name: tenant.display_name || tenant.name || slug,
    logo_url: tenant.logo_url || null,
    super_admin_name: superAdminName || tenant.display_name || tenant.name || slug,
  });
}

export async function POST(req: Request) {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const formData = await req.formData();
  const slug = String(formData.get("slug") || "");
  const displayName = String(formData.get("display_name") || "").trim();
  const logoFile = formData.get("logo");

  if (!slug) return NextResponse.json({ error: "Missing slug." }, { status: 400 });
  if (!displayName) return NextResponse.json({ error: "Display name is required." }, { status: 400 });

  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

  const allowed = await canManageBranding(tenant.id, user.id);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const service = createServerSupabaseClient();
  let logoUrl: string | null = tenant.logo_url || null;

  if (logoFile instanceof File && logoFile.size > 0) {
    if (logoFile.size > 2 * 1024 * 1024) {
      return NextResponse.json({ error: "Logo must be 2MB or less." }, { status: 400 });
    }

    const contentType = logoFile.type || "image/png";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "Logo must be an image file." }, { status: 400 });
    }

    const { data: buckets } = await service.storage.listBuckets();
    const exists = (buckets || []).some((b) => b.name === BRANDING_BUCKET);
    if (!exists) {
      await service.storage.createBucket(BRANDING_BUCKET, { public: true });
    }

    const ext = (logoFile.name.split(".").pop() || "png").toLowerCase();
    const path = `${tenant.id}/logo.${ext}`;
    const bytes = await logoFile.arrayBuffer();

    const { error: uploadError } = await service.storage.from(BRANDING_BUCKET).upload(path, bytes, {
      contentType,
      upsert: true,
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message || "Failed to upload logo." }, { status: 400 });
    }

    const { data: publicData } = service.storage.from(BRANDING_BUCKET).getPublicUrl(path);
    logoUrl = publicData.publicUrl;
  }

  const { error: updateError } = await service
    .from("tenants")
    .update({
      display_name: displayName,
      logo_url: logoUrl,
    })
    .eq("id", tenant.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message || "Failed to save branding." }, { status: 400 });
  }

  return NextResponse.json({ success: true, display_name: displayName, logo_url: logoUrl });
}
