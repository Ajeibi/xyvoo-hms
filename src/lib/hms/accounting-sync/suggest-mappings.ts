import type { ExternalAccount } from "@/lib/hms/accounting-sync/driver";

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Suggests a Sage ledger account for each XYVOO account: same account number first, then same name,
 * then one name containing the other. Never overwrites an existing mapping and never reuses a Sage account
 * that is already taken. Pure, so it runs in the browser too.
 */
export function suggestMappings(
  accounts: { code: string; name: string }[],
  external: ExternalAccount[],
  existing: Record<string, string>,
): Record<string, ExternalAccount> {
  const out: Record<string, ExternalAccount> = {};
  const used = new Set(Object.values(existing));
  const byCode = new Map(external.filter((e) => e.code).map((e) => [String(e.code).trim(), e]));
  const byName = new Map(external.map((e) => [norm(e.name), e]));

  for (const a of accounts) {
    if (existing[a.code]) continue;
    const name = norm(a.name);
    const candidates = [
      byCode.get(a.code.trim()),
      byName.get(name),
      name.length >= 4 ? external.find((e) => norm(e.name).includes(name) || name.includes(norm(e.name))) : undefined,
    ];
    const hit = candidates.find((c) => c && !used.has(c.id));
    if (hit) {
      out[a.code] = hit;
      used.add(hit.id);
    }
  }
  return out;
}
