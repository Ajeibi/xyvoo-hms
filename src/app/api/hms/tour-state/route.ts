import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const UpdateTourStateSchema = z.object({
  slug: z.string().min(1),
  status: z.enum(["skipped", "completed"]),
});

export async function POST(req: Request) {
  try {
    const auth = await createSupabaseAuthServerClient();
    const {
      data: { user },
    } = await auth.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const parsed = UpdateTourStateSchema.parse(await req.json());
    const tenant = await getHotelTenantBySlug(parsed.slug);
    if (!tenant) return NextResponse.json({ error: "Tenant not found." }, { status: 404 });

    const service = createServerSupabaseClient();
    const { data: membership } = await service
      .schema("hotel")
      .from("memberships")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (parsed.status === "skipped") {
      const { error: tenantTourError } = await service
        .from("tenants")
        .update({ hms_dashboard_tour_hidden: true })
        .eq("id", tenant.id)
        .eq("product", "hotel");

      if (tenantTourError) {
        return NextResponse.json(
          { error: tenantTourError.message || "Unable to save tenant tour preference." },
          { status: 400 },
        );
      }
    }

    const { data: existingProfile, error: profileLookupError } = await service
      .schema("hotel")
      .from("profiles")
      .select("id")
      .eq("tenant_id", tenant.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileLookupError) {
      return NextResponse.json({ error: profileLookupError.message || "Unable to load profile." }, { status: 400 });
    }

    if (existingProfile?.id) {
      const { error: updateError } = await service
        .schema("hotel")
        .from("profiles")
        .update({ dashboard_tour_status: parsed.status })
        .eq("id", existingProfile.id);

      if (updateError) {
        return NextResponse.json({ error: updateError.message || "Unable to save tour status." }, { status: 400 });
      }
    } else {
      const { error: insertError } = await service.schema("hotel").from("profiles").insert({
        tenant_id: tenant.id,
        user_id: user.id,
        dashboard_tour_status: parsed.status,
      });

      if (insertError) {
        return NextResponse.json({ error: insertError.message || "Unable to create profile." }, { status: 400 });
      }
    }

    return NextResponse.json({ success: true, status: parsed.status });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message || "Invalid input." }, { status: 400 });
    }

    return NextResponse.json({ error: "Unable to save tour status." }, { status: 500 });
  }
}
