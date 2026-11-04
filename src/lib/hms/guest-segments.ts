import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { guestHasVipTag } from "@/lib/hms/front-desk-board";
import { loadGuestMetrics } from "@/lib/hms/guest-metrics";
import { getLoyaltySettings, getLoyaltyTotals } from "@/lib/hms/guest-loyalty";
import { tierFor } from "@/lib/hms/guest-loyalty-shared";
import {
  BUILT_IN_SEGMENTS,
  describeRules,
  matchesRules,
  sanitizeRules,
  type SegmentGuest,
  type SegmentRules,
} from "@/lib/hms/guest-segments-shared";
import type { ConsentChannel } from "@/lib/hms/guest-consent-shared";

const PAGE = 1000;

export type SegmentSummary = {
  key: string;
  id: string | null;
  label: string;
  description: string;
  rules: SegmentRules;
  builtIn: boolean;
  count: number;
};

/** Every guest in the hotel with the facts the segment rules need. */
export async function loadSegmentPool(service: SupabaseClient, tenantId: string): Promise<SegmentGuest[]> {
  const rows: Record<string, unknown>[] = [];
  const select = "id,title,first_name,last_name,email,phone,nationality,date_of_birth,tags,company_id,anonymised_at,marketing_email,marketing_sms,marketing_whatsapp";
  const fallback = "id,title,first_name,last_name,email,phone,nationality,date_of_birth,tags";
  let useSelect = select;
  for (let from = 0; ; from += PAGE) {
    const res = await service.schema("hotel").from("guests").select(useSelect).eq("tenant_id", tenantId).order("id").range(from, from + PAGE - 1);
    if (res.error && useSelect === select) {
      // The profile or consent columns haven't been added yet: carry on with what exists.
      useSelect = fallback;
      from = -PAGE;
      rows.length = 0;
      continue;
    }
    const data = (res.data ?? []) as unknown as Record<string, unknown>[];
    rows.push(...data);
    if (data.length < PAGE) break;
  }

  const [metrics, settings] = await Promise.all([loadGuestMetrics(service, tenantId), getLoyaltySettings(service, tenantId)]);
  const totals = settings.enabled ? await getLoyaltyTotals(service, tenantId) : new Map<string, { balance: number; lifetime: number }>();

  return rows.map((g) => {
    const id = g.id as string;
    const m = metrics.get(id);
    const tags = Array.isArray(g.tags) ? (g.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];
    const t = totals.get(id);
    return {
      id,
      name: `${(g.title as string | null) ? `${g.title} ` : ""}${g.first_name} ${g.last_name}`.trim(),
      email: (g.email as string) ?? "",
      phone: (g.phone as string) ?? "",
      nationality: ((g.nationality as string) ?? "").trim(),
      dateOfBirth: (g.date_of_birth as string | null) ?? null,
      tags,
      isVip: guestHasVipTag({ tags }) || Boolean(m?.hasVipStay),
      companyId: (g.company_id as string | null | undefined) ?? null,
      anonymised: Boolean(g.anonymised_at),
      consent: {
        email: Boolean(g.marketing_email),
        sms: Boolean(g.marketing_sms),
        whatsapp: Boolean(g.marketing_whatsapp),
      },
      completedStays: m?.completedStays ?? 0,
      staysStarted: m?.staysStarted ?? 0,
      spend: m?.spend ?? 0,
      lastStayAt: m?.lastStayAt ?? null,
      tier: settings.enabled ? (tierFor(t?.lifetime ?? 0, settings.tiers).tier?.name ?? null) : null,
      loyaltyBalance: t?.balance ?? 0,
    } satisfies SegmentGuest;
  });
}

export async function listSavedSegments(service: SupabaseClient, tenantId: string) {
  const { data } = await service.schema("hotel").from("guest_segments").select("id,name,rules").eq("tenant_id", tenantId).order("name");
  return (data ?? []).map((s) => ({ id: s.id as string, name: s.name as string, rules: sanitizeRules(s.rules) }));
}

/** The ready-made and saved segments, each with how many guests are in it right now. */
export async function summariseSegments(service: SupabaseClient, tenantId: string, pool?: SegmentGuest[]): Promise<{ segments: SegmentSummary[]; total: number }> {
  const guests = pool ?? (await loadSegmentPool(service, tenantId));
  const saved = await listSavedSegments(service, tenantId);
  const now = new Date();
  const count = (rules: SegmentRules) => guests.filter((g) => matchesRules(rules, g, now)).length;
  const segments: SegmentSummary[] = [
    ...BUILT_IN_SEGMENTS.map((s) => ({ key: s.key, id: null, label: s.label, description: s.description, rules: s.rules, builtIn: true, count: count(s.rules) })),
    ...saved.map((s) => ({ key: `saved:${s.id}`, id: s.id, label: s.name, description: describeRules(s.rules), rules: s.rules, builtIn: false, count: count(s.rules) })),
  ];
  return { segments, total: guests.filter((g) => !g.anonymised).length };
}

/** The rules a segment key stands for: builtin:<name> or saved:<id>. */
export async function rulesForKey(service: SupabaseClient, tenantId: string, key: string): Promise<{ label: string; rules: SegmentRules } | null> {
  if (key.startsWith("builtin:")) {
    const s = BUILT_IN_SEGMENTS.find((b) => b.key === key);
    return s ? { label: s.label, rules: s.rules } : null;
  }
  if (key.startsWith("saved:")) {
    const id = key.slice("saved:".length);
    const { data } = await service.schema("hotel").from("guest_segments").select("name,rules").eq("tenant_id", tenantId).eq("id", id).maybeSingle();
    return data ? { label: data.name as string, rules: sanitizeRules(data.rules) } : null;
  }
  return null;
}

export async function saveSegment(
  service: SupabaseClient,
  params: { tenantId: string; actorUserId: string; name: string; rules: unknown },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = params.name.trim();
  if (!name) return { ok: false, error: "Give the segment a name." };
  const rules = sanitizeRules(params.rules);
  if (Object.keys(rules).length === 0) return { ok: false, error: "Pick at least one rule, or it would be everyone." };
  const { data, error } = await service
    .schema("hotel")
    .from("guest_segments")
    .insert({ tenant_id: params.tenantId, name, rules, created_by: params.actorUserId })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: /duplicate|unique/i.test(error?.message ?? "") ? "You already have a segment with that name." : (error?.message ?? "Could not save.") };
  await writeAuditLog({ tenantId: params.tenantId, actorUserId: params.actorUserId, action: "guest_segment_saved", entityType: "guest_segment", entityId: data.id as string, after: { name } });
  return { ok: true, id: data.id as string };
}

export async function deleteSegment(service: SupabaseClient, params: { tenantId: string; actorUserId: string; id: string }) {
  const { error } = await service.schema("hotel").from("guest_segments").delete().eq("tenant_id", params.tenantId).eq("id", params.id);
  if (error) return { ok: false as const, error: error.message };
  await writeAuditLog({ tenantId: params.tenantId, actorUserId: params.actorUserId, action: "guest_segment_deleted", entityType: "guest_segment", entityId: params.id });
  return { ok: true as const };
}

const csvCell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  // Keep a spreadsheet from running a cell that starts with = + - @ as a formula.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

/**
 * The guests in a group as CSV. With `consentChannel`, only people who agreed to marketing on that
 * channel are included, which is what you want before sending offers.
 */
export function guestsToCsv(guests: SegmentGuest[], consentChannel?: ConsentChannel | "any" | null): string {
  const list = consentChannel
    ? guests.filter((g) => (consentChannel === "any" ? g.consent.email || g.consent.sms || g.consent.whatsapp : g.consent[consentChannel]))
    : guests;
  const header = ["Name", "Email", "Phone", "Nationality", "Completed stays", "Spent", "Last stay", "Tier", "Agreed to email", "Agreed to SMS", "Agreed to WhatsApp"];
  const lines = [header.map(csvCell).join(",")];
  for (const g of list) {
    lines.push(
      [
        g.name,
        g.email,
        g.phone,
        g.nationality,
        g.completedStays,
        Math.round(g.spend),
        g.lastStayAt ? g.lastStayAt.slice(0, 10) : "",
        g.tier ?? "",
        g.consent.email ? "Yes" : "No",
        g.consent.sms ? "Yes" : "No",
        g.consent.whatsapp ? "Yes" : "No",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}
