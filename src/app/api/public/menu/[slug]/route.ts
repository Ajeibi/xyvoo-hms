import { NextResponse } from "next/server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { loadPublicMenu } from "@/lib/hms/fb-menu";
import { normalizePricingSetup } from "@/lib/hms/room-pricing";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const { slug } = await params;
    const tenant = await getHotelTenantBySlug(slug);
    if (!tenant) return NextResponse.json({ error: "Property not found." }, { status: 404 });

    const service = createServerSupabaseClient();
    const outlets = await loadPublicMenu(service, tenant.id);
    const pricing = normalizePricingSetup(tenant.pricing_setup);

    return NextResponse.json({
      hotel: {
        name: tenant.display_name?.trim() || tenant.name?.trim() || slug,
        logoUrl: tenant.logo_url ?? null,
        currency: pricing.currency,
      },
      outlets,
    });
  } catch {
    return NextResponse.json({ error: "Unable to load menu." }, { status: 500 });
  }
}
