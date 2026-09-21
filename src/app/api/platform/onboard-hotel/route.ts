import { NextResponse } from "next/server";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/platform/auth";
import { isStrongPassword } from "@/app/api/hotel/register/_lib";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";

const BodySchema = z.object({
  contactName: z.string().min(1).max(120),
  contactEmail: z.string().email(),
  contactPhone: z.string().max(40).optional(),
  password: z.string().min(8),
  plan: z.enum(["monthly", "quarterly", "yearly"]),
  hotelName: z.string().min(1).max(120),
  subdomain: z.string().min(2).max(63),
  roomCount: z.number().int().positive().optional(),
  country: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  address: z.string().max(200).optional(),
  hotelType: z.string().max(80).optional(),
  logoUrl: z.string().url().optional(),
});

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 63);
}

export async function POST(req: Request) {
  try {
    const body = BodySchema.parse(await req.json());
    const auth = await requirePlatformAdmin();
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (!isStrongPassword(body.password)) {
      return NextResponse.json(
        { error: "Temporary password must be at least 8 characters with an uppercase letter, a number, and a symbol." },
        { status: 400 },
      );
    }

    const subdomain = slugify(body.subdomain);
    if (!subdomain) {
      return NextResponse.json({ error: "Subdomain must contain at least one letter or number." }, { status: 400 });
    }

    const { service } = auth;

    const { data: subdomainMatch } = await service.from("tenants").select("id").eq("subdomain", subdomain).maybeSingle();
    if (subdomainMatch) {
      return NextResponse.json({ error: `Subdomain "${subdomain}" is already taken — try another.` }, { status: 409 });
    }

    const tenantId = crypto.randomUUID();
    const { error: tenantError } = await service.from("tenants").insert({
      id: tenantId,
      subdomain,
      name: subdomain,
      display_name: body.hotelName,
      product: "hotel",
      logo_url: body.logoUrl || null,
    });
    if (tenantError) {
      return NextResponse.json({ error: `Could not create tenant: ${tenantError.message}` }, { status: 400 });
    }

    const { data: createdUser, error: createUserError } = await service.auth.admin.createUser({
      email: body.contactEmail,
      password: body.password,
      email_confirm: true,
      user_metadata: { full_name: body.contactName },
    });

    if (createUserError || !createdUser.user) {
      // Compensating cleanup — the tenant row has no owner without a user, so don't leave it behind.
      await service.from("tenants").delete().eq("id", tenantId);
      return NextResponse.json(
        { error: createUserError?.message || "Could not create the owner account (email may already be in use)." },
        { status: 400 },
      );
    }

    const userId = createdUser.user.id;
    const now = new Date();
    const trialEnds = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    const { error: profileError } = await service.schema("hotel").from("profiles").upsert(
      {
        tenant_id: tenantId,
        user_id: userId,
        contact_name: body.contactName,
        contact_phone: body.contactPhone || null,
        country: body.country || null,
        city: body.city || null,
        address: body.address || null,
        room_count: body.roomCount ?? null,
        hotel_type: body.hotelType || null,
        trial_starts_at: now.toISOString(),
        trial_ends_at: trialEnds.toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (profileError) {
      return NextResponse.json({ error: `Could not save hotel profile: ${profileError.message}` }, { status: 400 });
    }

    const { error: membershipError } = await service.schema("hotel").from("memberships").upsert(
      { tenant_id: tenantId, user_id: userId, role: "owner" },
      { onConflict: "tenant_id,user_id" },
    );
    if (membershipError) {
      return NextResponse.json({ error: `Could not assign owner membership: ${membershipError.message}` }, { status: 400 });
    }

    await service.schema("hotel").from("registration_sessions").upsert(
      {
        tenant_id: tenantId,
        contact_email: body.contactEmail,
        step: "completed",
        metadata: {
          hotel_name: body.hotelName,
          contact_phone: body.contactPhone || null,
          country: body.country || null,
          city: body.city || null,
          address: body.address || null,
          room_count: body.roomCount ?? null,
          hotel_type: body.hotelType || null,
          billing_plan: body.plan,
          onboarded_by: "admin",
        },
      },
      { onConflict: "tenant_id" },
    );

    await writeAuditLog({
      tenantId,
      actorUserId: auth.user.id,
      action: "tenant_onboarded_by_admin",
      entityType: "tenant",
      entityId: tenantId,
      after: { hotel_name: body.hotelName, subdomain, contact_email: body.contactEmail, plan: body.plan },
    });

    return NextResponse.json({ ok: true, tenantId, slug: subdomain });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.issues[0]?.message ?? "Invalid request." }, { status: 400 });
    }
    console.error("[onboard-hotel POST]", e);
    return NextResponse.json({ error: "Could not onboard hotel." }, { status: 500 });
  }
}
