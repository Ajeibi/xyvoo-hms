import { emailKey, phoneKey } from "@/lib/hms/guest-fields";

/** Finding guests who are probably the same person. Pure, so it is safe for the browser and easy to test. */

export type DuplicateGuest = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  idNumber: string;
  dateOfBirth: string;
};

export type DuplicateReason = "id" | "email" | "phone" | "name_and_birthday";

export const REASON_LABEL: Record<DuplicateReason, string> = {
  id: "Same ID number",
  email: "Same email",
  phone: "Same phone",
  name_and_birthday: "Same name and birthday",
};

const WEIGHT: Record<DuplicateReason, number> = { id: 50, email: 40, name_and_birthday: 40, phone: 30 };

export type DuplicatePair = {
  a: string;
  b: string;
  reasons: DuplicateReason[];
  score: number;
  confidence: "very_likely" | "likely" | "possible";
};

const alnum = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function idKey(id: string) {
  const k = alnum(id);
  return k.length >= 5 && k !== "erased" ? k : "";
}

function nameDobKey(g: DuplicateGuest) {
  const first = alnum(g.firstName);
  const last = alnum(g.lastName);
  const dob = g.dateOfBirth?.slice(0, 10) ?? "";
  // 1900-01-01 is what an erased guest is given.
  if (!first || !last || !dob || dob === "1900-01-01") return "";
  return `${first}|${last}|${dob}`;
}

/** The order of the two ids in a dismissal, which is always lower id first. */
export const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/**
 * Pairs that share an ID number, an email, a phone number, or a name and birthday. A key shared by
 * more than `maxGroup` guests (a switchboard number, a travel agent's email) is ignored, because
 * it says nothing about who is who. Pairs staff dismissed are left out.
 */
export function findDuplicatePairs(guests: DuplicateGuest[], dismissed: Set<string> = new Set(), maxGroup = 5): DuplicatePair[] {
  const groups = new Map<string, { reason: DuplicateReason; ids: string[] }>();
  const add = (reason: DuplicateReason, key: string, id: string) => {
    if (!key) return;
    const k = `${reason}:${key}`;
    const g = groups.get(k) ?? { reason, ids: [] };
    g.ids.push(id);
    groups.set(k, g);
  };
  for (const g of guests) {
    add("id", idKey(g.idNumber), g.id);
    add("email", emailKey(g.email), g.id);
    add("phone", phoneKey(g.phone), g.id);
    add("name_and_birthday", nameDobKey(g), g.id);
  }

  const pairs = new Map<string, Set<DuplicateReason>>();
  for (const { reason, ids } of groups.values()) {
    if (ids.length < 2 || ids.length > maxGroup) continue;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = pairKey(ids[i], ids[j]);
        if (dismissed.has(key)) continue;
        const set = pairs.get(key) ?? new Set<DuplicateReason>();
        set.add(reason);
        pairs.set(key, set);
      }
    }
  }

  const out: DuplicatePair[] = [];
  for (const [key, set] of pairs) {
    const [a, b] = key.split("|");
    const reasons = [...set];
    const score = reasons.reduce((s, r) => s + WEIGHT[r], 0);
    out.push({ a, b, reasons, score, confidence: score >= 70 ? "very_likely" : score >= 40 ? "likely" : "possible" });
  }
  return out.sort((x, y) => y.score - x.score);
}
