import { allRows } from "@/lib/supabase/all-rows";
import { badge, escapeHtml, type EmailLayout } from "@/lib/mail/layout";
import { sendBrandedEmail } from "@/lib/mail/mailtrap";
import { rateLimitShared } from "@/lib/rate-limit";
import { formatShopCurrency } from "@/lib/shop/format";
import { getShopProductsByIds } from "@/lib/shop/products";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { audienceSchema, blockSchema, campaignRates, sendAllowance, type CampaignAudience, type CampaignBlock, type CampaignInput, type CampaignStats, type CampaignStatus } from "./campaigns";
import { inGroup } from "./customer-groups";
import { listCustomerGroups } from "./customer-groups-server";
import { listCustomers } from "./customers";
import { STORE_PATHS } from "./site/links";
import { storefrontUrl } from "./subdomain";
import { emailLanguage, translatorFor } from "./i18n/shopper";
import type { ShopLanguage } from "./i18n/languages";

const db = () => createServerSupabaseClient().schema("store");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const normaliseEmail = (email: string) => email.trim().toLowerCase();

// ---------------------------------------------------------------------------
// Consent: who has said the shop may email them.
// ---------------------------------------------------------------------------

export type ConsentSource = "checkout" | "newsletter" | "account" | "manual";

/**
 * Records that this person agreed to hear from the shop. Someone who had
 * unsubscribed and ticks the box again has chosen to come back. Never throws:
 * a failure here must not hold up an order.
 */
export async function recordMarketingConsent(tenantId: string, email: string, name: string | null | undefined, source: ConsentSource) {
  const address = normaliseEmail(email);
  if (!EMAIL_PATTERN.test(address) || address.length > 200) return false;
  try {
    const { data: existing } = await db().from("marketing_contacts").select("id, name").eq("tenant_id", tenantId).eq("email", address).maybeSingle();
    if (existing) {
      await db()
        .from("marketing_contacts")
        .update({ consented_at: new Date().toISOString(), unsubscribed_at: null, name: existing.name || name?.trim() || null })
        .eq("id", existing.id);
    } else {
      await db().from("marketing_contacts").insert({ tenant_id: tenantId, email: address, name: name?.trim() || null, source });
    }
    return true;
  } catch (error) {
    console.error("[marketing consent] not saved", error);
    return false;
  }
}

/** "Unsubscribe": by the private key in every campaign email. Also marks the campaign it came from. */
export async function unsubscribeByKey(tenantId: string, key: string, recipientToken?: string | null) {
  if (!/^[0-9a-f-]{36}$/i.test(key)) return false;
  const { data, error } = await db()
    .from("marketing_contacts")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("unsubscribe_key", key)
    .select("email")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return false;
  if (recipientToken && /^[0-9a-f-]{36}$/i.test(recipientToken)) {
    await db().from("campaign_recipients").update({ unsubscribed_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("token", recipientToken).is("unsubscribed_at", null);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Audience.
// ---------------------------------------------------------------------------

export type Contact = { email: string; name: string | null; key: string };

/** Everyone who agreed and hasn't unsubscribed, narrowed to a customer group when the campaign asks. */
export async function resolveAudience(tenantId: string, audience: CampaignAudience): Promise<Contact[]> {
  // Paged: an audience can be bigger than one request returns.
  const { data, error } = await allRows<{ email: string; name: string | null; unsubscribe_key: string }>(
    (from, to) => db().from("marketing_contacts").select("email, name, unsubscribe_key").eq("tenant_id", tenantId).is("unsubscribed_at", null).order("id").range(from, to),
    20_000,
  );
  if (error) throw new Error(error.message);
  let contacts: Contact[] = data.map((c) => ({ email: c.email as string, name: (c.name as string | null) ?? null, key: c.unsubscribe_key as string }));
  if (audience.type === "everyone") return contacts;

  const customers = await listCustomers(tenantId);
  let allowed: Set<string>;
  if (audience.type === "segment") {
    allowed = new Set(customers.filter((c) => c.segment === audience.key && c.email).map((c) => normaliseEmail(c.email as string)));
  } else {
    const group = (await listCustomerGroups(tenantId)).find((g) => g.id === audience.id);
    if (!group) return [];
    const now = Date.now();
    allowed = new Set(customers.filter((c) => c.email && inGroup(group, c, now)).map((c) => normaliseEmail(c.email as string)));
  }
  contacts = contacts.filter((c) => allowed.has(c.email));
  return contacts;
}

// ---------------------------------------------------------------------------
// The email itself.
// ---------------------------------------------------------------------------

/** `lang`: the shop's main language, for the words around the campaign (a campaign goes to many people at once). */
type Shop = { tenantId: string; slug: string; storeName: string; shopEmail: string | null; currency: string; url: string; lang: ShopLanguage };

async function getShop(tenantId: string): Promise<Shop> {
  const [{ data: tenant }, { data: profile }, lang] = await Promise.all([
    createServerSupabaseClient().from("tenants").select("subdomain, name, display_name").eq("id", tenantId).maybeSingle(),
    db().from("business_profile").select("business_email, currency_code").eq("tenant_id", tenantId).maybeSingle(),
    emailLanguage(tenantId, null),
  ]);
  const slug = String(tenant?.subdomain || tenant?.name || "");
  return {
    tenantId,
    slug,
    storeName: (tenant?.display_name as string | null)?.trim() || slug,
    shopEmail: (profile?.business_email as string | null) ?? null,
    currency: (profile?.currency_code as string | null) || "NGN",
    url: storefrontUrl(slug),
    lang,
  };
}

type ResolvedBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "button"; label: string; link: number }
  | { type: "product"; name: string; price: string; wasPrice: string | null; imageUrl: string | null; link: number };

/**
 * Turns the blocks into what is sent: product details filled in from today's
 * shop, and every link collected into one list so clicks can be counted and
 * can only go where the email itself points.
 */
export async function resolveBlocks(shop: Shop, blocks: CampaignBlock[]): Promise<{ blocks: ResolvedBlock[]; links: string[] }> {
  const products = new Map((await getShopProductsByIds(shop.tenantId, blocks.flatMap((b) => (b.type === "product" ? [b.productId] : [])))).map((p) => [p.id, p]));
  const links: string[] = [];
  const linkIndex = (href: string) => {
    const full = href.startsWith("/") ? `${shop.url}${href}` : href;
    const at = links.indexOf(full);
    if (at >= 0) return at;
    links.push(full);
    return links.length - 1;
  };

  const resolved: ResolvedBlock[] = [];
  for (const b of blocks) {
    if (b.type === "heading" || b.type === "text") resolved.push(b);
    else if (b.type === "button") resolved.push({ type: "button", label: b.label, link: linkIndex(b.url) });
    else {
      const p = products.get(b.productId);
      if (!p) throw new CampaignError("PRODUCT_UNAVAILABLE", "One of the products you chose isn't available in your shop any more. Remove it and try again.");
      resolved.push({
        type: "product",
        name: p.name,
        price: formatShopCurrency(p.price, p.currency),
        wasPrice: p.onSale ? formatShopCurrency(p.compareAtPrice ?? 0, p.currency) : null,
        imageUrl: p.imageUrl,
        link: linkIndex(p.slug ? STORE_PATHS.product(p.slug) : "/products"),
      });
    }
  }
  return { blocks: resolved, links };
}

export class CampaignError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const para = (text: string) => escapeHtml(text).replace(/\r?\n/g, "<br>");

/** The branded email for one person. `href(i)` is where link i goes (tracked for real sends, direct for tests). */
export function renderCampaignEmail(opts: {
  shop: Shop;
  subject: string;
  previewText: string | null;
  blocks: ResolvedBlock[];
  href: (link: number) => string;
  unsubscribeUrl: string;
  pixelUrl?: string;
}): { layout: EmailLayout; text: string } {
  const { shop, blocks, href, unsubscribeUrl } = opts;
  // Only the words around the shop's own content; the campaign itself stays as the shop wrote it.
  const t = translatorFor(shop.lang);
  const body = blocks
    .map((b) => {
      switch (b.type) {
        case "heading":
          return `<h2 style="margin:28px 0 8px;color:#000d1f;font-size:20px;line-height:1.3;font-weight:800">${escapeHtml(b.text)}</h2>`;
        case "text":
          return `<p style="margin:0 0 16px;color:#334155;font-size:15px;line-height:1.65">${para(b.text)}</p>`;
        case "button":
          return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 20px"><tr><td><a href="${escapeHtml(href(b.link))}" style="display:inline-block;padding:13px 22px;border-radius:10px;font-size:14px;font-weight:700;text-decoration:none;background:#007edf;color:#ffffff">${escapeHtml(b.label)}</a></td></tr></table>`;
        case "product":
          return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 20px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden"><tr>
            ${b.imageUrl ? `<td width="140" style="width:140px;vertical-align:top"><a href="${escapeHtml(href(b.link))}"><img src="${escapeHtml(b.imageUrl)}" width="140" alt="" style="display:block;width:140px;height:auto;border:0"></a></td>` : ""}
            <td style="padding:16px;vertical-align:middle">
              <p style="margin:0 0 6px;color:#000d1f;font-size:16px;font-weight:700;line-height:1.4">${escapeHtml(b.name)}</p>
              <p style="margin:0 0 12px;color:#334155;font-size:15px">${b.wasPrice ? `<span style="color:#64748b;text-decoration:line-through">${escapeHtml(b.wasPrice)}</span> ` : ""}<strong>${escapeHtml(b.price)}</strong></p>
              <a href="${escapeHtml(href(b.link))}" style="color:#007edf;font-size:14px;font-weight:700;text-decoration:none">${escapeHtml(t("emails.campaignSeeInShop"))} &rarr;</a>
            </td></tr></table>`;
      }
    })
    .join("");

  const text = [
    ...blocks.map((b) => {
      if (b.type === "heading" || b.type === "text") return b.text;
      if (b.type === "button") return `${b.label}: ${href(b.link)}`;
      return `${b.name} (${b.wasPrice ? t("emails.campaignWasNow", { was: b.wasPrice, price: b.price }) : b.price}): ${href(b.link)}`;
    }),
    "",
    `${t("emails.campaignWhy", { shop: shop.storeName })} ${t("emails.campaignUnsubscribe")}: ${unsubscribeUrl}`,
  ].join("\n\n");

  return {
    text,
    layout: {
      lang: t.lang,
      helpCentre: t("emails.helpCentre"),
      preheader: opts.previewText || opts.subject,
      badges: [badge(shop.storeName, "blue")],
      title: opts.subject,
      body: `${body}<p style="margin:28px 0 0;color:#64748b;font-size:12px;line-height:1.6">${escapeHtml(t("emails.campaignDontWant", { shop: shop.storeName }))} <a href="${escapeHtml(unsubscribeUrl)}" style="color:#64748b">${escapeHtml(t("emails.campaignUnsubscribe"))}</a>.</p>${opts.pixelUrl ? `<img src="${escapeHtml(opts.pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;width:1px;height:1px">` : ""}`,
      footerNote: t("emails.campaignFooter", { shop: shop.storeName }),
    },
  };
}

// ---------------------------------------------------------------------------
// Campaigns.
// ---------------------------------------------------------------------------

export type Campaign = {
  id: string;
  subject: string;
  previewText: string | null;
  blocks: CampaignBlock[];
  audience: CampaignAudience;
  status: CampaignStatus;
  scheduledAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  recipientCount: number;
  createdAt: string;
  stats: CampaignStats;
  rates: ReturnType<typeof campaignRates>;
};

type CampaignRow = {
  id: string;
  tenant_id: string;
  subject: string;
  preview_text: string | null;
  blocks: unknown;
  audience: unknown;
  status: CampaignStatus;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  recipient_count: number;
  links: string[] | null;
  created_at: string;
};

const COLUMNS = "id, tenant_id, subject, preview_text, blocks, audience, status, scheduled_at, started_at, finished_at, recipient_count, links, created_at";
const EMPTY_STATS: CampaignStats = { recipients: 0, sent: 0, failed: 0, pending: 0, opened: 0, clicked: 0, unsubscribed: 0 };

function toCampaign(row: CampaignRow, stats: CampaignStats | undefined): Campaign {
  const blocks = blockSchema.array().safeParse(row.blocks);
  const audience = audienceSchema.safeParse(row.audience);
  const s = stats ?? EMPTY_STATS;
  return {
    id: row.id,
    subject: row.subject,
    previewText: row.preview_text,
    blocks: blocks.success ? blocks.data : [],
    audience: audience.success ? audience.data : { type: "everyone" },
    status: row.status,
    scheduledAt: row.scheduled_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    recipientCount: row.recipient_count,
    createdAt: row.created_at,
    stats: s,
    rates: campaignRates(s),
  };
}

const missingTable = (error: { code?: string } | null) => Boolean(error && (error.code === "42P01" || error.code === "PGRST205" || error.code === "PGRST202"));

export async function listCampaigns(tenantId: string): Promise<Campaign[]> {
  const [{ data, error }, { data: stats }] = await Promise.all([
    db().from("campaigns").select(COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(100),
    db().rpc("campaign_stats", { p_tenant_id: tenantId }),
  ]);
  if (error) {
    if (missingTable(error)) return [];
    throw new Error(error.message);
  }
  const byId = new Map(
    ((stats || []) as Record<string, unknown>[]).map((r) => [
      r.campaign_id as string,
      {
        recipients: Number(r.recipients),
        sent: Number(r.sent),
        failed: Number(r.failed),
        pending: Number(r.pending),
        opened: Number(r.opened),
        clicked: Number(r.clicked),
        unsubscribed: Number(r.unsubscribed),
      },
    ]),
  );
  return ((data || []) as CampaignRow[]).map((r) => toCampaign(r, byId.get(r.id)));
}

async function getRow(tenantId: string, id: string) {
  const { data } = await db().from("campaigns").select(COLUMNS).eq("tenant_id", tenantId).eq("id", id).maybeSingle();
  return (data as CampaignRow | null) ?? null;
}

export async function createCampaign(tenantId: string, userId: string | null, input: CampaignInput) {
  const { data, error } = await db()
    .from("campaigns")
    .insert({ tenant_id: tenantId, subject: input.subject, preview_text: input.previewText, blocks: input.blocks, audience: input.audience, created_by: userId })
    .select(COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  return toCampaign(data as CampaignRow, undefined);
}

/** Only a draft or a scheduled campaign can be changed; a scheduled one goes back to a draft. */
export async function updateCampaign(tenantId: string, id: string, input: CampaignInput) {
  const row = await getRow(tenantId, id);
  if (!row) throw new CampaignError("NOT_FOUND", "That campaign can't be found.");
  if (row.status !== "draft" && row.status !== "scheduled") throw new CampaignError("LOCKED", "This campaign has already started sending, so it can't be changed.");
  const { data, error } = await db()
    .from("campaigns")
    .update({ subject: input.subject, preview_text: input.previewText, blocks: input.blocks, audience: input.audience, status: "draft", scheduled_at: null, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .in("status", ["draft", "scheduled"])
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new CampaignError("LOCKED", "This campaign has already started sending, so it can't be changed.");
  return toCampaign(data as CampaignRow, undefined);
}

export async function deleteCampaign(tenantId: string, id: string) {
  const row = await getRow(tenantId, id);
  if (!row) throw new CampaignError("NOT_FOUND", "That campaign can't be found.");
  if (row.status === "sending") throw new CampaignError("LOCKED", "Stop this campaign before removing it.");
  const { error } = await db().from("campaigns").delete().eq("tenant_id", tenantId).eq("id", id);
  if (error) throw new Error(error.message);
  return row.subject;
}

async function sentInLast24h(tenantId: string) {
  const { count } = await db()
    .from("campaign_recipients")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("status", "sent")
    .gt("sent_at", new Date(Date.now() - 24 * 3_600_000).toISOString());
  return count ?? 0;
}

/** Fills the queue for a campaign and starts it sending. */
async function activate(row: CampaignRow) {
  const audience = audienceSchema.parse(row.audience);
  const contacts = await resolveAudience(row.tenant_id, audience);
  if (contacts.length) {
    for (let i = 0; i < contacts.length; i += 500) {
      const { error } = await db()
        .from("campaign_recipients")
        .upsert(
          contacts.slice(i, i + 500).map((c) => ({ campaign_id: row.id, tenant_id: row.tenant_id, email: c.email, name: c.name })),
          { onConflict: "campaign_id,email", ignoreDuplicates: true },
        );
      if (error) throw new Error(error.message);
    }
  }
  await db()
    .from("campaigns")
    .update({
      status: contacts.length ? "sending" : "sent",
      started_at: new Date().toISOString(),
      finished_at: contacts.length ? null : new Date().toISOString(),
      recipient_count: contacts.length,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
  return contacts.length;
}

/** Sends now, or schedules for later. Checks the audience and the daily limit first. */
export async function startCampaign(tenantId: string, id: string, scheduledAt: string | null) {
  const row = await getRow(tenantId, id);
  if (!row) throw new CampaignError("NOT_FOUND", "That campaign can't be found.");
  if (row.status !== "draft" && row.status !== "scheduled") throw new CampaignError("LOCKED", "This campaign has already been sent.");
  const parsed = blockSchema.array().min(1).safeParse(row.blocks);
  if (!parsed.success) throw new CampaignError("INVALID", "This campaign has nothing to send yet. Add something to say.");

  const shop = await getShop(tenantId);
  const resolved = await resolveBlocks(shop, parsed.data);
  const audience = audienceSchema.parse(row.audience);
  const recipients = (await resolveAudience(tenantId, audience)).length;
  if (recipients === 0) throw new CampaignError("NO_RECIPIENTS", "Nobody in this audience has agreed to receive emails yet. Choose a wider audience, or wait until more customers tick the box at checkout or join your newsletter.");
  const allowance = sendAllowance(await sentInLast24h(tenantId));
  if (recipients > allowance) {
    throw new CampaignError("DAILY_LIMIT", `You can send up to ${allowance.toLocaleString("en-GB")} more emails today, and this campaign would go to ${recipients.toLocaleString("en-GB")}. Choose a smaller audience, or schedule it for tomorrow.`);
  }

  await db().from("campaigns").update({ links: resolved.links, updated_at: new Date().toISOString() }).eq("id", id);
  if (scheduledAt) {
    await db().from("campaigns").update({ status: "scheduled", scheduled_at: new Date(scheduledAt).toISOString() }).eq("id", id);
    return { status: "scheduled" as const, recipients };
  }
  await activate({ ...row, links: resolved.links });
  return { status: "sending" as const, recipients };
}

/** Stops a campaign that is waiting or part-sent. Anyone not yet emailed is skipped. */
export async function cancelCampaign(tenantId: string, id: string) {
  const row = await getRow(tenantId, id);
  if (!row) throw new CampaignError("NOT_FOUND", "That campaign can't be found.");
  if (row.status !== "scheduled" && row.status !== "sending") throw new CampaignError("LOCKED", "Only a scheduled or sending campaign can be stopped.");
  await db().from("campaigns").update({ status: "cancelled", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id);
  await db().from("campaign_recipients").update({ status: "skipped" }).eq("campaign_id", id).in("status", ["pending", "sending"]);
}

/** A test copy to one address, so the owner sees exactly what customers will see. Never counted or tracked. */
export async function sendTestCampaign(tenantId: string, id: string, to: string) {
  const row = await getRow(tenantId, id);
  if (!row) throw new CampaignError("NOT_FOUND", "That campaign can't be found.");
  const parsed = blockSchema.array().min(1).safeParse(row.blocks);
  if (!parsed.success) throw new CampaignError("INVALID", "Add something to say before sending a test.");
  const shop = await getShop(tenantId);
  const { blocks, links } = await resolveBlocks(shop, parsed.data);
  const email = renderCampaignEmail({ shop, subject: `[Test] ${row.subject}`, previewText: row.preview_text, blocks, href: (i) => links[i], unsubscribeUrl: `${shop.url}/unsubscribe` });
  await sendBrandedEmail({ to, subject: `[Test] ${row.subject}`, text: email.text, layout: email.layout, replyTo: shop.shopEmail });
}

// ---------------------------------------------------------------------------
// Sending.
// ---------------------------------------------------------------------------

const BATCH = 50;

/** Sends one batch for a campaign. Returns how many went out. */
async function sendBatch(row: CampaignRow, shop: Shop, budgetMs: number): Promise<number> {
  const started = Date.now();
  const parsed = blockSchema.array().safeParse(row.blocks);
  if (!parsed.success) return 0;
  const resolved = await resolveBlocks(shop, parsed.data).catch(() => null);
  const links = row.links ?? [];
  if (!resolved) {
    // A product was removed since it was started; send what we can without failing the whole run.
    return 0;
  }

  let sent = 0;
  for (;;) {
    if (Date.now() - started > budgetMs) break;
    const allowance = sendAllowance(await sentInLast24h(shop.tenantId));
    if (allowance <= 0) break;
    const { data: claimed, error } = await db().rpc("claim_campaign_recipients", { p_campaign_id: row.id, p_limit: Math.min(BATCH, allowance) });
    if (error) throw new Error(error.message);
    const batch = (claimed || []) as { id: string; email: string; name: string | null; token: string }[];
    if (!batch.length) break;

    const { data: contacts } = await db().from("marketing_contacts").select("email, unsubscribe_key, unsubscribed_at").eq("tenant_id", shop.tenantId).in("email", batch.map((b) => b.email));
    const contactFor = new Map((contacts || []).map((c) => [c.email as string, c]));

    for (const r of batch) {
      const contact = contactFor.get(r.email);
      if (!contact || contact.unsubscribed_at) {
        await db().from("campaign_recipients").update({ status: "skipped" }).eq("id", r.id);
        continue;
      }
      const track = (i: number) => `${shop.url}/api/shop/${shop.slug}/m/c/${r.token}/${i}`;
      const unsubscribeUrl = `${shop.url}/unsubscribe?k=${contact.unsubscribe_key}&r=${r.token}`;
      const email = renderCampaignEmail({
        shop,
        subject: row.subject,
        previewText: row.preview_text,
        blocks: resolved.blocks,
        href: (i) => (links[i] ? track(i) : resolved.links[i]),
        unsubscribeUrl,
        pixelUrl: `${shop.url}/api/shop/${shop.slug}/m/o/${r.token}`,
      });
      try {
        await sendBrandedEmail({
          to: r.email,
          subject: row.subject,
          text: email.text,
          layout: email.layout,
          replyTo: shop.shopEmail,
          headers: {
            "List-Unsubscribe": `<${shop.url}/api/shop/${shop.slug}/marketing/unsubscribe?k=${contact.unsubscribe_key}&r=${r.token}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          },
        });
        await db().from("campaign_recipients").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", r.id);
        sent += 1;
      } catch (err) {
        console.error("[campaign] email not sent", err);
        const final = (await db().from("campaign_recipients").select("attempts").eq("id", r.id).single()).data?.attempts >= 3;
        await db()
          .from("campaign_recipients")
          .update({ status: final ? "failed" : "pending", error: err instanceof Error ? err.message.slice(0, 200) : "Not sent" })
          .eq("id", r.id);
      }
      if (Date.now() - started > budgetMs) break;
    }
  }
  return sent;
}

/** Marks a campaign sent once nobody is left waiting. */
async function finishIfDone(id: string) {
  const { count } = await db().from("campaign_recipients").select("id", { count: "exact", head: true }).eq("campaign_id", id).in("status", ["pending", "sending"]);
  if ((count ?? 0) === 0) {
    await db().from("campaigns").update({ status: "sent", finished_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", id).eq("status", "sending");
  }
}

/** Starts anything scheduled that is now due, then sends for campaigns that are mid-way. */
export async function processCampaigns(budgetMs = 25_000) {
  const started = Date.now();
  const nowIso = new Date().toISOString();
  const { data: due, error: dueError } = await db().from("campaigns").select(COLUMNS).eq("status", "scheduled").lte("scheduled_at", nowIso).limit(20);
  if (dueError) {
    if (missingTable(dueError)) return 0;
    throw new Error(dueError.message);
  }
  for (const row of (due || []) as CampaignRow[]) {
    // Claim it first so two runs can't both start it.
    const { data: claimed } = await db().from("campaigns").update({ status: "sending", updated_at: nowIso }).eq("id", row.id).eq("status", "scheduled").select("id");
    if (claimed?.length) await activate(row).catch((e) => console.error("[campaign] could not start", e));
  }

  const { data: running } = await db().from("campaigns").select(COLUMNS).eq("status", "sending").order("started_at", { ascending: true }).limit(10);
  let sent = 0;
  for (const row of (running || []) as CampaignRow[]) {
    const left = budgetMs - (Date.now() - started);
    if (left < 2000) break;
    try {
      const shop = await getShop(row.tenant_id);
      sent += await sendBatch(row, shop, left);
      await finishIfDone(row.id);
    } catch (err) {
      console.error("[campaign] run failed", err);
    }
  }
  return sent;
}

/** Runs the sender at most once every ten minutes, whoever asks. Called after busy requests, alongside the daily cron. */
export async function runCampaignsIfDue() {
  try {
    if (!(await rateLimitShared("job:campaigns", 1, 10 * 60_000)).ok) return;
    await processCampaigns();
  } catch (err) {
    console.error("[campaigns] run failed", err);
  }
}

/** Sends right after "Send now", rather than waiting for the next ten-minute run. */
export async function kickCampaigns() {
  try {
    await processCampaigns();
  } catch (err) {
    console.error("[campaigns] kick failed", err);
  }
}

// ---------------------------------------------------------------------------
// Tracking.
// ---------------------------------------------------------------------------

const TOKEN = /^[0-9a-f-]{36}$/i;

export async function recordOpen(tenantId: string, token: string) {
  if (!TOKEN.test(token)) return;
  await db().from("campaign_recipients").update({ opened_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("token", token).is("opened_at", null);
}

/** Where a click goes: only a link that is in the campaign's own list. Null if it isn't. */
export async function recordClick(tenantId: string, token: string, index: number): Promise<string | null> {
  if (!TOKEN.test(token) || !Number.isInteger(index) || index < 0) return null;
  const { data: recipient } = await db().from("campaign_recipients").select("id, campaign_id, clicked_at, opened_at").eq("tenant_id", tenantId).eq("token", token).maybeSingle();
  if (!recipient) return null;
  const { data: campaign } = await db().from("campaigns").select("links").eq("id", recipient.campaign_id).eq("tenant_id", tenantId).maybeSingle();
  const target = (campaign?.links as string[] | null)?.[index];
  if (!target) return null;
  const now = new Date().toISOString();
  await db().from("campaign_recipients").update({ clicked_at: recipient.clicked_at ?? now, opened_at: recipient.opened_at ?? now }).eq("id", recipient.id);
  return target;
}
