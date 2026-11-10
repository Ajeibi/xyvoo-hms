import { NextResponse } from "next/server";
import { z } from "zod";
import { authHr, fail, isFailure } from "@/lib/hms/hr/hr-api";
import { decideSwap } from "@/lib/hms/hr/hr-swaps";

const Body = z.object({
  slug: z.string().min(1),
  id: z.string().uuid(),
  approve: z.boolean(),
  note: z.string().max(300).nullable().optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail("Pick a request.");
  const a = await authHr(parsed.data.slug);
  if (isFailure(a)) return a;
  const r = await decideSwap(a.auth.service, a.auth.tenant.id, parsed.data.id, parsed.data.approve, parsed.data.note ?? null, a.actor);
  return r.error ? fail(r.error) : NextResponse.json({ ok: true });
}
