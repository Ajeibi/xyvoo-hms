import { NextResponse } from "next/server";
import { z } from "zod";
import { requireGroupApi } from "./group-access";
import type { GroupRole } from "./group-types";

/** Shared plumbing for /api/hotel/groups/[groupSlug]/* routes. */

export const OWNER: GroupRole[] = ["group_owner"];
export const EDITORS: GroupRole[] = ["group_owner", "group_admin"];

export async function withGroup<T>(
  groupSlug: string,
  roles: GroupRole[],
  run: (ctx: Extract<Awaited<ReturnType<typeof requireGroupApi>>, { ctx: unknown }>["ctx"]) => Promise<T>,
) {
  const auth = await requireGroupApi(groupSlug, roles);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const result = await run(auth.ctx);
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) return NextResponse.json({ error: e.issues[0]?.message || "Check what you entered." }, { status: 400 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Something went wrong." }, { status: 400 });
  }
}
