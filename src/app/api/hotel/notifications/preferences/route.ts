import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHotelApiMember } from "@/lib/hms/hotel-api-auth";
import { ALERT_GROUPS, groupsForRole } from "@/lib/hms/notification-catalogue";
import {
  getAlertChoices,
  getHotelDefaults,
  saveAlertChoices,
  type AlertChoices,
} from "@/lib/hms/notification-preferences";
import { getUserSettings, saveUserSettings, userSettingsSchema } from "@/lib/hms/notification-settings";
import { getPushPublicKey } from "@/lib/store/push";
import { whatsappMode } from "@/lib/store/whatsapp-sender";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";

const isManager = (role: string) => role === "owner" || role === "admin";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });
  const auth = await requireHotelApiMember(slug);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const manager = isManager(auth.role);
  const roleGroups = groupsForRole(auth.role, auth.departmentRole);
  const [choices, settings, hotelDefaults, devices] = await Promise.all([
    getAlertChoices(auth.service, auth.tenant.id, auth.user.id),
    getUserSettings(auth.service, auth.tenant.id, auth.user.id),
    manager ? getHotelDefaults(auth.service, auth.tenant.id) : Promise.resolve(null),
    auth.service
      .schema("hotel")
      .from("notification_devices")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", auth.tenant.id)
      .eq("user_id", auth.user.id),
  ]);

  return NextResponse.json({
    // The grid lists only what this person's role gets; owners and admins setting hotel defaults see all.
    groups: ALERT_GROUPS.filter((g) => !roleGroups || roleGroups.includes(g.key)),
    allGroups: ALERT_GROUPS,
    choices,
    settings,
    canSetDefaults: manager,
    hotelDefaults,
    email: auth.user.email ?? null,
    devices: devices.count ?? 0,
    pushPublicKey: getPushPublicKey(),
    whatsappLive: whatsappMode() === "cloud",
  });
}

const channelChoice = z.object({ in_app: z.boolean(), email: z.boolean(), whatsapp: z.boolean(), push: z.boolean() });
const choicesSchema = z.object(
  Object.fromEntries(ALERT_GROUPS.map((g) => [g.key, channelChoice])) as Record<(typeof ALERT_GROUPS)[number]["key"], typeof channelChoice>,
);

const PutSchema = z.object({
  slug: z.string().min(1),
  scope: z.enum(["me", "hotel"]),
  choices: choicesSchema,
  settings: userSettingsSchema.optional(),
});

export async function PUT(req: Request) {
  try {
    const body = PutSchema.parse(await req.json());
    const auth = await requireHotelApiMember(body.slug);
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

    if (body.scope === "hotel") {
      if (!isManager(auth.role)) return NextResponse.json({ error: "Only an owner or admin can set the hotel's defaults." }, { status: 403 });
      const saved = await saveAlertChoices(auth.service, auth.tenant.id, null, body.choices as AlertChoices);
      if (!saved.ok) return NextResponse.json({ error: "Could not save the hotel's defaults." }, { status: 500 });
      await writeAuditLog({ tenantId: auth.tenant.id, actorUserId: auth.user.id, action: "notification_defaults_changed", entityType: "notification_defaults", after: body.choices });
      return NextResponse.json({ ok: true });
    }

    const saved = await saveAlertChoices(auth.service, auth.tenant.id, auth.user.id, body.choices as AlertChoices);
    if (!saved.ok) return NextResponse.json({ error: "Could not save your choices. Try again." }, { status: 500 });
    if (body.settings) {
      const s = await saveUserSettings(auth.service, auth.tenant.id, auth.user.id, body.settings);
      if (!s.ok) return NextResponse.json({ error: "Could not save your contact and quiet-hours settings. Try again." }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message ?? "Check what you entered." }, { status: 400 });
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
}
