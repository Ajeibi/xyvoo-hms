import type { SupabaseClient } from "@supabase/supabase-js";
import { writeAuditLog } from "@/lib/hms/front-desk-ops";
import { getArAgingReport } from "@/lib/hms/customer-invoices";
import { loadBilled, type StayBilled } from "@/lib/hms/guest-metrics";

/*
 * Companies and travel agents as profiles of their own.
 *  - A company is a customer in Accounts (hotel.ar_customers). Its guests are the guests linked to it,
 *    and its stays are those guests' stays plus any stay whose bill has a company window billed to it.
 *  - A travel agent is a supplier marked is_travel_agent (hotel.vendors). Its stays are the bookings that name it.
 * Spend always comes from the bill (see guest-metrics.ts).
 */

const chunk = <T,>(items: T[], size = 150) => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

export type ProfileStay = {
  id: string;
  confirmationCode: string;
  status: string;
  guestName: string;
  guestId: string | null;
  arrivalAt: string;
  departureAt: string;
  nights: number;
  roomTypeCode: string;
  billed: number;
  roomBilled: number;
  commission: number | null;
};

type StayRow = {
  id: string;
  confirmation_code: string;
  status: string;
  arrival_at: string;
  departure_at: string;
  nights: number | null;
  room_type_code: string;
  total_room_charges: number | string | null;
  agent_commission_percent?: number | string | null;
  reservation_guests: { guest_id: string; is_primary: boolean; guests: { id: string; first_name: string; last_name: string } | { id: string; first_name: string; last_name: string }[] | null }[] | null;
};

const STAY_SELECT =
  "id,confirmation_code,status,arrival_at,departure_at,nights,room_type_code,total_room_charges,reservation_guests(guest_id,is_primary,guests(id,first_name,last_name))";

async function fetchStays(service: SupabaseClient, tenantId: string, ids: string[], withAgent: boolean): Promise<StayRow[]> {
  const out: StayRow[] = [];
  for (const part of chunk(ids)) {
    const { data } = await service
      .schema("hotel")
      .from("reservations")
      .select(withAgent ? `${STAY_SELECT},agent_commission_percent` : STAY_SELECT)
      .eq("tenant_id", tenantId)
      .in("id", part);
    out.push(...((data ?? []) as unknown as StayRow[]));
  }
  return out;
}

function toProfileStay(r: StayRow, billed: Map<string, StayBilled | null>): ProfileStay {
  const primary = (r.reservation_guests ?? []).find((g) => g.is_primary) ?? (r.reservation_guests ?? [])[0];
  const g = primary ? (Array.isArray(primary.guests) ? primary.guests[0] : primary.guests) : null;
  const b = billed.get(r.id) ?? null;
  const total = b ? b.total : Number(r.total_room_charges) || 0;
  const rooms = b ? b.rooms : Number(r.total_room_charges) || 0;
  const pct = r.agent_commission_percent != null ? Number(r.agent_commission_percent) : null;
  return {
    id: r.id,
    confirmationCode: r.confirmation_code,
    status: r.status,
    guestName: g ? `${g.first_name} ${g.last_name}`.trim() : "—",
    guestId: g?.id ?? null,
    arrivalAt: r.arrival_at,
    departureAt: r.departure_at,
    nights: Number(r.nights) || 0,
    roomTypeCode: r.room_type_code,
    billed: total,
    roomBilled: rooms,
    commission: pct != null ? Math.round(rooms * pct) / 100 : null,
  };
}

const counted = (s: { status: string }) => s.status === "checked_in" || s.status === "checked_out";

/* ---------------- Companies ---------------- */

export type CompanyListRow = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  status: string;
  guestCount: number;
  stays: number;
  nights: number;
  spend: number;
  lastStayAt: string | null;
  owed: number;
};

/** Reservation ids that belong to a company: its linked guests' stays and stays with a window billed to it. */
async function companyReservationIds(service: SupabaseClient, tenantId: string, companyIds: string[]) {
  const byCompany = new Map<string, Set<string>>(companyIds.map((id) => [id, new Set<string>()]));

  const guestCompany = new Map<string, string>();
  for (const part of chunk(companyIds)) {
    const { data } = await service.schema("hotel").from("guests").select("id,company_id").eq("tenant_id", tenantId).in("company_id", part);
    for (const g of data ?? []) guestCompany.set(g.id as string, g.company_id as string);
  }
  const guestIds = [...guestCompany.keys()];
  for (const part of chunk(guestIds)) {
    const { data } = await service.schema("hotel").from("reservation_guests").select("reservation_id,guest_id").in("guest_id", part);
    for (const l of data ?? []) {
      const company = guestCompany.get(l.guest_id as string);
      if (company) byCompany.get(company)?.add(l.reservation_id as string);
    }
  }
  for (const part of chunk(companyIds)) {
    const { data } = await service.schema("hotel").from("folio_windows").select("reservation_id,ar_customer_id").eq("tenant_id", tenantId).in("ar_customer_id", part);
    for (const w of data ?? []) byCompany.get(w.ar_customer_id as string)?.add(w.reservation_id as string);
  }
  return { byCompany, guestCompany };
}

export async function listCompanies(service: SupabaseClient, tenantId: string): Promise<CompanyListRow[]> {
  const { data: companies } = await service
    .schema("hotel")
    .from("ar_customers")
    .select("id,name,contact_name,phone,email,status")
    .eq("tenant_id", tenantId)
    .order("name");
  const list = companies ?? [];
  if (list.length === 0) return [];
  const ids = list.map((c) => c.id as string);

  const { byCompany, guestCompany } = await companyReservationIds(service, tenantId, ids);
  const allRes = [...new Set([...byCompany.values()].flatMap((s) => [...s]))];
  const stays = await fetchStays(service, tenantId, allRes, false);
  const stayById = new Map(stays.map((s) => [s.id, s]));
  const billed = await loadBilled(service, tenantId, stays.filter(counted).map((s) => s.id));
  const aging = new Map((await getArAgingReport(service, tenantId).catch(() => [])).map((r) => [r.customerId, r.total]));

  const guestCount = new Map<string, number>();
  for (const company of guestCompany.values()) guestCount.set(company, (guestCount.get(company) ?? 0) + 1);

  return list.map((c) => {
    const id = c.id as string;
    let nStays = 0;
    let nights = 0;
    let spend = 0;
    let last: string | null = null;
    for (const resId of byCompany.get(id) ?? []) {
      const s = stayById.get(resId);
      if (!s || !counted(s)) continue;
      nStays += 1;
      nights += Number(s.nights) || 0;
      spend += billed.get(resId)?.total ?? (Number(s.total_room_charges) || 0);
      if (!last || s.departure_at > last) last = s.departure_at;
    }
    return {
      id,
      name: c.name as string,
      contactName: (c.contact_name as string | null) ?? null,
      phone: (c.phone as string | null) ?? null,
      email: (c.email as string | null) ?? null,
      status: c.status as string,
      guestCount: guestCount.get(id) ?? 0,
      stays: nStays,
      nights,
      spend,
      lastStayAt: last,
      owed: aging.get(id) ?? 0,
    };
  });
}

export type CompanyProfile = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentTerms: string | null;
  creditLimit: number | null;
  currency: string;
  status: string;
  notes: string | null;
  taxId: string | null;
  industry: string | null;
  accountManager: string | null;
  negotiatedRateNote: string | null;
  guests: { id: string; name: string; completedStays: number; spend: number; lastStayAt: string | null }[];
  stays: ProfileStay[];
  totals: { stays: number; nights: number; spend: number; owed: number };
};

export async function getCompanyProfile(service: SupabaseClient, tenantId: string, companyId: string): Promise<CompanyProfile | null> {
  const first = await service.schema("hotel").from("ar_customers").select("*").eq("tenant_id", tenantId).eq("id", companyId).maybeSingle();
  const c = first.data as Record<string, unknown> | null;
  if (!c) return null;

  const { byCompany } = await companyReservationIds(service, tenantId, [companyId]);
  const resIds = [...(byCompany.get(companyId) ?? [])];
  const stays = await fetchStays(service, tenantId, resIds, false);
  stays.sort((a, b) => b.arrival_at.localeCompare(a.arrival_at));
  const billed = await loadBilled(service, tenantId, stays.filter(counted).map((s) => s.id));
  const rows = stays.map((s) => toProfileStay(s, billed));

  const { data: guestRows } = await service
    .schema("hotel")
    .from("guests")
    .select("id,first_name,last_name")
    .eq("tenant_id", tenantId)
    .eq("company_id", companyId)
    .order("last_name");
  const perGuest = new Map<string, { stays: number; spend: number; last: string | null }>();
  for (const s of stays) {
    if (!counted(s)) continue;
    const primary = (s.reservation_guests ?? []).find((g) => g.is_primary) ?? (s.reservation_guests ?? [])[0];
    if (!primary) continue;
    const e = perGuest.get(primary.guest_id) ?? { stays: 0, spend: 0, last: null };
    e.stays += s.status === "checked_out" ? 1 : 0;
    e.spend += billed.get(s.id)?.total ?? (Number(s.total_room_charges) || 0);
    if (!e.last || s.departure_at > e.last) e.last = s.departure_at;
    perGuest.set(primary.guest_id, e);
  }

  const aging = await getArAgingReport(service, tenantId).catch(() => []);
  const done = stays.filter(counted);
  return {
    id: companyId,
    name: c.name as string,
    contactName: (c.contact_name as string | null) ?? null,
    phone: (c.phone as string | null) ?? null,
    email: (c.email as string | null) ?? null,
    address: (c.address as string | null) ?? null,
    paymentTerms: (c.payment_terms as string | null) ?? null,
    creditLimit: c.credit_limit != null ? Number(c.credit_limit) : null,
    currency: (c.currency as string) ?? "NGN",
    status: c.status as string,
    notes: (c.notes as string | null) ?? null,
    taxId: (c.tax_id as string | null | undefined) ?? null,
    industry: (c.industry as string | null | undefined) ?? null,
    accountManager: (c.account_manager as string | null | undefined) ?? null,
    negotiatedRateNote: (c.negotiated_rate_note as string | null | undefined) ?? null,
    guests: (guestRows ?? []).map((g) => {
      const e = perGuest.get(g.id as string);
      return { id: g.id as string, name: `${g.first_name} ${g.last_name}`.trim(), completedStays: e?.stays ?? 0, spend: e?.spend ?? 0, lastStayAt: e?.last ?? null };
    }),
    stays: rows.slice(0, 50),
    totals: {
      stays: done.length,
      nights: done.reduce((n, s) => n + (Number(s.nights) || 0), 0),
      spend: done.reduce((n, s) => n + (billed.get(s.id)?.total ?? (Number(s.total_room_charges) || 0)), 0),
      owed: aging.find((r) => r.customerId === companyId)?.total ?? 0,
    },
  };
}

export type CompanyFields = {
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  paymentTerms?: string | null;
  taxId?: string | null;
  industry?: string | null;
  accountManager?: string | null;
  negotiatedRateNote?: string | null;
  notes?: string | null;
};

const blank = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

function companyRow(f: CompanyFields) {
  return {
    name: f.name.trim(),
    contact_name: blank(f.contactName),
    phone: blank(f.phone),
    email: blank(f.email),
    address: blank(f.address),
    payment_terms: blank(f.paymentTerms),
    tax_id: blank(f.taxId),
    industry: blank(f.industry),
    account_manager: blank(f.accountManager),
    negotiated_rate_note: blank(f.negotiatedRateNote),
    notes: blank(f.notes),
  };
}

/** Adds a company. It is also a customer in Accounts, since both are the same record. */
export async function createCompany(service: SupabaseClient, params: { tenantId: string; actorUserId: string; fields: CompanyFields }) {
  if (!params.fields.name.trim()) return { ok: false as const, error: "Enter the company's name." };
  const { data, error } = await service
    .schema("hotel")
    .from("ar_customers")
    .insert({ tenant_id: params.tenantId, ...companyRow(params.fields) })
    .select("id")
    .single();
  if (error || !data) return { ok: false as const, error: error?.message ?? "Could not add the company." };
  await writeAuditLog({ tenantId: params.tenantId, actorUserId: params.actorUserId, action: "company_created", entityType: "company", entityId: data.id as string, after: { name: params.fields.name } });
  return { ok: true as const, id: data.id as string };
}

export async function updateCompany(service: SupabaseClient, params: { tenantId: string; actorUserId: string; id: string; fields: CompanyFields }) {
  if (!params.fields.name.trim()) return { ok: false as const, error: "Enter the company's name." };
  const { error } = await service
    .schema("hotel")
    .from("ar_customers")
    .update({ ...companyRow(params.fields), updated_at: new Date().toISOString() })
    .eq("tenant_id", params.tenantId)
    .eq("id", params.id);
  if (error) return { ok: false as const, error: error.message };
  await writeAuditLog({ tenantId: params.tenantId, actorUserId: params.actorUserId, action: "company_updated", entityType: "company", entityId: params.id });
  return { ok: true as const };
}

/* ---------------- Travel agents ---------------- */

export type AgentListRow = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  commissionPercent: number | null;
  stays: number;
  nights: number;
  spend: number;
  commission: number;
  lastStayAt: string | null;
};

async function agentStays(service: SupabaseClient, tenantId: string, agentIds: string[]) {
  const out: (StayRow & { travel_agent_vendor_id: string })[] = [];
  for (const part of chunk(agentIds)) {
    for (let from = 0; ; from += 1000) {
      const { data } = await service
        .schema("hotel")
        .from("reservations")
        .select(`${STAY_SELECT},agent_commission_percent,travel_agent_vendor_id`)
        .eq("tenant_id", tenantId)
        .in("travel_agent_vendor_id", part)
        .order("id")
        .range(from, from + 999);
      out.push(...((data ?? []) as unknown as (StayRow & { travel_agent_vendor_id: string })[]));
      if ((data ?? []).length < 1000) break;
    }
  }
  return out;
}

export async function listAgents(service: SupabaseClient, tenantId: string): Promise<AgentListRow[]> {
  const { data: agents, error } = await service
    .schema("hotel")
    .from("vendors")
    .select("id,name,contact_name,phone,email,commission_percent")
    .eq("tenant_id", tenantId)
    .eq("is_travel_agent", true)
    .order("name");
  if (error) return [];
  const list = agents ?? [];
  if (list.length === 0) return [];
  const stays = await agentStays(service, tenantId, list.map((a) => a.id as string));
  const billed = await loadBilled(service, tenantId, stays.filter(counted).map((s) => s.id));

  return list.map((a) => {
    const mine = stays.filter((s) => s.travel_agent_vendor_id === a.id && counted(s));
    let commission = 0;
    for (const s of mine) commission += toProfileStay(s, billed).commission ?? 0;
    return {
      id: a.id as string,
      name: a.name as string,
      contactName: (a.contact_name as string | null) ?? null,
      phone: (a.phone as string | null) ?? null,
      email: (a.email as string | null) ?? null,
      commissionPercent: a.commission_percent != null ? Number(a.commission_percent) : null,
      stays: mine.length,
      nights: mine.reduce((n, s) => n + (Number(s.nights) || 0), 0),
      spend: mine.reduce((n, s) => n + (billed.get(s.id)?.total ?? (Number(s.total_room_charges) || 0)), 0),
      commission,
      lastStayAt: mine.reduce<string | null>((l, s) => (!l || s.departure_at > l ? s.departure_at : l), null),
    };
  });
}

export type AgentProfile = AgentListRow & { address: string | null; country: string | null; paymentTerms: string | null; notes: string | null; recent: ProfileStay[]; cancelled: number };

export async function getAgentProfile(service: SupabaseClient, tenantId: string, agentId: string): Promise<AgentProfile | null> {
  const { data: a } = await service
    .schema("hotel")
    .from("vendors")
    .select("id,name,contact_name,phone,email,address,country,payment_terms,notes,commission_percent,is_travel_agent")
    .eq("tenant_id", tenantId)
    .eq("id", agentId)
    .maybeSingle();
  if (!a || !a.is_travel_agent) return null;
  const stays = await agentStays(service, tenantId, [agentId]);
  stays.sort((x, y) => y.arrival_at.localeCompare(x.arrival_at));
  const billed = await loadBilled(service, tenantId, stays.filter(counted).map((s) => s.id));
  const done = stays.filter(counted);
  const rows = stays.map((s) => toProfileStay(s, billed));
  return {
    id: agentId,
    name: a.name as string,
    contactName: (a.contact_name as string | null) ?? null,
    phone: (a.phone as string | null) ?? null,
    email: (a.email as string | null) ?? null,
    address: (a.address as string | null) ?? null,
    country: (a.country as string | null) ?? null,
    paymentTerms: (a.payment_terms as string | null) ?? null,
    notes: (a.notes as string | null) ?? null,
    commissionPercent: a.commission_percent != null ? Number(a.commission_percent) : null,
    stays: done.length,
    nights: done.reduce((n, s) => n + (Number(s.nights) || 0), 0),
    spend: done.reduce((n, s) => n + (billed.get(s.id)?.total ?? (Number(s.total_room_charges) || 0)), 0),
    commission: rows.filter((r, i) => counted(stays[i])).reduce((n, r) => n + (r.commission ?? 0), 0),
    lastStayAt: done.reduce<string | null>((l, s) => (!l || s.departure_at > l ? s.departure_at : l), null),
    recent: rows.slice(0, 50),
    cancelled: stays.filter((s) => s.status === "cancelled" || s.status === "no_show").length,
  };
}
