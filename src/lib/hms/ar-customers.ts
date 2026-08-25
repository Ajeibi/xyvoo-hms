import type { SupabaseClient } from "@supabase/supabase-js";

export const AR_CUSTOMER_STATUSES = ["active", "inactive"] as const;
export type ArCustomerStatus = (typeof AR_CUSTOMER_STATUSES)[number];

export type ArCustomerRow = {
  id: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  currency: string;
  paymentTerms: string | null;
  creditLimit: number | null;
  status: ArCustomerStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(r: Record<string, unknown>): ArCustomerRow {
  return {
    id: r.id as string,
    name: r.name as string,
    contactName: (r.contact_name as string | null) ?? null,
    phone: (r.phone as string | null) ?? null,
    email: (r.email as string | null) ?? null,
    address: (r.address as string | null) ?? null,
    currency: r.currency as string,
    paymentTerms: (r.payment_terms as string | null) ?? null,
    creditLimit: r.credit_limit != null ? Number(r.credit_limit) : null,
    status: r.status as ArCustomerStatus,
    notes: (r.notes as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function listArCustomers(
  service: SupabaseClient,
  tenantId: string,
  opts?: { status?: ArCustomerStatus[] },
): Promise<ArCustomerRow[]> {
  let q = service
    .schema("hotel")
    .from("ar_customers")
    .select("id,name,contact_name,phone,email,address,currency,payment_terms,credit_limit,status,notes,created_at,updated_at")
    .eq("tenant_id", tenantId)
    .order("name", { ascending: true });
  if (opts?.status?.length) q = q.in("status", opts.status);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => mapRow(r as Record<string, unknown>));
}

export async function createArCustomer(
  service: SupabaseClient,
  params: {
    tenantId: string;
    name: string;
    contactName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    currency?: string;
    paymentTerms?: string | null;
    creditLimit?: number | null;
    notes?: string | null;
  },
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = params.name.trim();
  if (!name) return { ok: false, error: "Name is required." };

  const { data, error } = await service
    .schema("hotel")
    .from("ar_customers")
    .insert({
      tenant_id: params.tenantId,
      name,
      contact_name: params.contactName ?? null,
      phone: params.phone ?? null,
      email: params.email ?? null,
      address: params.address ?? null,
      currency: params.currency ?? "NGN",
      payment_terms: params.paymentTerms ?? null,
      credit_limit: params.creditLimit ?? null,
      notes: params.notes ?? null,
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, id: data.id as string };
}
