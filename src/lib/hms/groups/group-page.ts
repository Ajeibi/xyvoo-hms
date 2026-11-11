import { notFound } from "next/navigation";
import { getGroupAccess, type GroupAccessContext } from "./group-access";
import type { GroupRole } from "./group-types";

/** For group pages: the context, or a 404 (the layout has already explained missing access). */
export async function requireGroupPage(groupSlug: string, roles?: GroupRole[]): Promise<GroupAccessContext> {
  const access = await getGroupAccess(groupSlug);
  if (!access.ok) notFound();
  if (roles && !roles.includes(access.ctx.role)) notFound();
  return access.ctx;
}

/** Reads ?from=&to= (YYYY-MM-DD), defaulting to this month so far. */
export function rangeFromSearch(search: Record<string, string | string[] | undefined>, today: string): { from: string; to: string } {
  const pick = (k: string) => (typeof search[k] === "string" ? (search[k] as string) : "");
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  let from = iso.test(pick("from")) ? pick("from") : `${today.slice(0, 7)}-01`;
  let to = iso.test(pick("to")) ? pick("to") : today;
  if (from > to) [from, to] = [to, from];
  return { from, to };
}

export function lagosToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
