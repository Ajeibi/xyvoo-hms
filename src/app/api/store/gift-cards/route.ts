import { NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import {
  getGiftCardSettings,
  giftCardSettingsSchema,
  issueGiftCard,
  issueGiftCardSchema,
  listGiftCards,
  resendGiftCard,
  saveGiftCardSettings,
  setGiftCardStatus,
} from "@/lib/store/gift-cards";

const ownersOnly = () => NextResponse.json({ error: "Only the owner or an admin can manage gift cards." }, { status: 403 });
const failed = (what: string, error: unknown) => {
  console.error(`[gift cards] ${what}`, error);
  return NextResponse.json({ error: "We couldn't do that just now. Please try again." }, { status: 500 });
};

/** GET /api/store/gift-cards?slug= — settings, every card, and the figures at the top. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canViewReports) return ownersOnly();
  try {
    const [settings, cards] = await Promise.all([getGiftCardSettings(resolved.access.tenantId), listGiftCards(resolved.access.tenantId)]);
    const live = cards.filter((c) => c.status === "active");
    return NextResponse.json({
      settings,
      cards,
      stats: {
        sold: cards.filter((c) => c.source === "purchase").reduce((s, c) => s + c.initialAmount, 0),
        soldCount: cards.filter((c) => c.source === "purchase").length,
        outstanding: live.reduce((s, c) => s + c.balance, 0),
        spent: cards.reduce((s, c) => s + (c.initialAmount - c.balance), 0),
      },
    });
  } catch (error) {
    return failed("list failed", error);
  }
}

/** PUT /api/store/gift-cards { slug, enabled, amounts, expiryMonths } — sell gift cards, and how. */
export async function PUT(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  const parsed = giftCardSettingsSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the settings." }, { status: 400 });
  try {
    const settings = await saveGiftCardSettings(resolved.access.tenantId, parsed.data);
    await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "gift_cards", action: "settings", targetId: null, targetLabel: null });
    return NextResponse.json({ settings });
  } catch (error) {
    return failed("settings not saved", error);
  }
}

/** POST /api/store/gift-cards { slug, amount, recipientName, recipientEmail, message? } — send a gift card from the shop. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  const parsed = issueGiftCardSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the details." }, { status: 400 });
  try {
    const card = await issueGiftCard(resolved.access.tenantId, parsed.data, resolved.access.userId);
    await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "gift_cards", action: "issued", targetId: card.id, targetLabel: parsed.data.recipientName });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return failed("not issued", error);
  }
}

const PatchSchema = z.object({ slug: z.string(), id: z.string().uuid(), action: z.enum(["disable", "enable", "resend"]), label: z.string().max(200).optional() });

/** PATCH /api/store/gift-cards { slug, id, action: disable | enable | resend } */
export async function PATCH(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Check the request." }, { status: 400 });
  const { id, action, label } = parsed.data;
  const tenantId = resolved.access.tenantId;
  try {
    if (action === "resend") {
      if (!(await resendGiftCard(tenantId, id))) return NextResponse.json({ error: "We couldn't send it. Check the card is switched on and has an email address." }, { status: 400 });
    } else {
      await setGiftCardStatus(tenantId, id, action === "disable" ? "disabled" : "active");
    }
    await logActivity({ tenantId, actor: resolved.access, area: "gift_cards", action: action === "resend" ? "resent" : action === "disable" ? "disabled" : "enabled", targetId: id, targetLabel: label ?? null });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed("not changed", error);
  }
}
