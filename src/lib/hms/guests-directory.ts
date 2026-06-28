import { createServerSupabaseClient } from "@/lib/supabase/server";

function displayName(g: { title?: string | null; first_name: string; last_name: string }) {
  const title = g.title?.trim();
  const name = `${g.first_name} ${g.last_name}`.trim();
  return title ? `${title} ${name}` : name;
}

export type GuestDirectoryRow = {
  id: string;
  displayName: string;
  phone: string;
  email: string;
  tags: string[];
  lastStayAt: string | null;
};

export async function getGuestsDirectory(tenantId: string): Promise<GuestDirectoryRow[]> {
  const supabase = createServerSupabaseClient();
  const { data: guests } = await supabase
    .schema("hotel")
    .from("guests")
    .select("id,title,first_name,last_name,phone,email,tags,created_at")
    .eq("tenant_id", tenantId)
    .order("last_name");

  const rows: GuestDirectoryRow[] = [];
  for (const g of guests ?? []) {
    const { data: lastRes } = await supabase
      .schema("hotel")
      .from("reservation_guests")
      .select("reservations(departure_at)")
      .eq("guest_id", g.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const tags = Array.isArray(g.tags) ? g.tags.filter((t): t is string => typeof t === "string") : [];
    const res = lastRes?.reservations as { departure_at: string } | { departure_at: string }[] | null;
    const departure = Array.isArray(res) ? res[0]?.departure_at : res?.departure_at;

    rows.push({
      id: g.id,
      displayName: displayName(g),
      phone: g.phone,
      email: g.email,
      tags,
      lastStayAt: departure ?? null,
    });
  }

  return rows;
}
