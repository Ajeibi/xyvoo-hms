import type { SupabaseClient } from "@supabase/supabase-js";
import { emailKey, phoneKey } from "@/lib/hms/guest-fields";

/*
 * Find the guest a check-in is really about, so a returning person keeps one profile
 * (and one history) instead of getting a new record every stay.
 *
 * Only strong matches count: the same ID number, or the same email or phone AND the same last name.
 * A name on its own never links two people.
 */

const PLACEHOLDER_ID = /^(CHILD|INFANT|ERASED)-/i;

export type GuestMatchInput = {
  idType: string;
  idNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
};

export type GuestMatch = { id: string; reason: "id" | "email" | "phone" };

type Row = Record<string, unknown>;

const normId = (v: string) => v.replace(/[^a-z0-9]/gi, "").toLowerCase();
const normName = (v: string) => v.trim().toLowerCase();
const COLUMNS = "id,first_name,last_name,id_type,id_number,email,phone";

export async function findExistingGuest(service: SupabaseClient, tenantId: string, input: GuestMatchInput): Promise<GuestMatch | null> {
  const guests = () => service.schema("hotel").from("guests");
  const clean = (rows: Row[] | null | undefined) => (rows ?? []).filter((g) => !g.anonymised_at);
  const last = normName(input.lastName);
  const first = normName(input.firstName);
  const sameFirstInitial = (g: Row) => !first || normName(String(g.first_name ?? "")).charAt(0) === first.charAt(0);

  // 1. The same identity document.
  const idKey = normId(input.idNumber);
  if (idKey.length >= 5 && !PLACEHOLDER_ID.test(input.idNumber.trim())) {
    const { data } = await guests().select(`${COLUMNS},anonymised_at`).eq("tenant_id", tenantId).eq("id_number", input.idNumber.trim()).limit(25);
    const hit = clean(data as Row[] | null).find((g) => g.id_type === input.idType && normId(String(g.id_number ?? "")) === idKey);
    if (hit) return { id: hit.id as string, reason: "id" };
  }

  // 2. The same email and last name.
  const em = emailKey(input.email);
  if (em && last) {
    const { data } = await guests().select(`${COLUMNS},anonymised_at`).eq("tenant_id", tenantId).ilike("email", em.replace(/[%_]/g, "")).limit(25);
    const hit = clean(data as Row[] | null).find((g) => emailKey(g.email as string) === em && normName(String(g.last_name ?? "")) === last && sameFirstInitial(g));
    if (hit) return { id: hit.id as string, reason: "email" };
  }

  // 3. The same phone and last name. Phones are stored with spaces and dashes, so narrow by surname and compare the digits here.
  const pk = phoneKey(input.phone);
  if (pk && last) {
    const { data } = await guests().select(`${COLUMNS},anonymised_at`).eq("tenant_id", tenantId).ilike("last_name", input.lastName.trim().replace(/[%_]/g, "")).limit(100);
    const hit = clean(data as Row[] | null).find((g) => phoneKey(g.phone as string) === pk && normName(String(g.last_name ?? "")) === last && sameFirstInitial(g));
    if (hit) return { id: hit.id as string, reason: "phone" };
  }
  return null;
}
