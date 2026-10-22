/*
 * Every row of a query, a page at a time. Hosted Supabase hands back at most
 * its row limit (1,000 by default) per request whatever .limit() asks for, so a
 * list that can grow past that (customers, contacts, points) must page. The
 * query must be ordered by something unique, so pages don't overlap or skip.
 *
 *   const rows = await allRows((from, to) => db.from("t").select("id").eq("tenant_id", id).order("id").range(from, to));
 */

const PAGE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>;

export async function allRows<T>(page: (from: number, to: number) => Page<T>, max = 100_000): Promise<{ data: T[]; error: { message: string; code?: string } | null }> {
  const rows: T[] = [];
  for (let from = 0; from < max; from += PAGE) {
    const { data, error } = await page(from, Math.min(from + PAGE, max) - 1);
    if (error) return { data: rows, error };
    rows.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  return { data: rows, error: null };
}

/** Splits a long list of ids, so `.in()` filters stay a sensible size. */
export function chunks<T>(items: T[], size = 200): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
