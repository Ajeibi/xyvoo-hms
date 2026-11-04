import { NextResponse } from "next/server";
import { canEditGuests, requireGuestsApi } from "@/lib/hms/guest-access";
import { guestsToCsv, loadSegmentPool, rulesForKey } from "@/lib/hms/guest-segments";
import { matchesRules } from "@/lib/hms/guest-segments-shared";
import { CONSENT_CHANNELS } from "@/lib/hms/guest-consent-shared";

/**
 * GET /api/hotel/guests/segments/export?slug=&segment=&consent=
 * The guests in a segment as a CSV file. `segment` is a key like builtin:vip or saved:<id>; leave it out for everyone.
 * `consent` (email, sms, whatsapp or any) keeps only people who agreed to offers on that channel.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const auth = await requireGuestsApi(url.searchParams.get("slug") ?? "");
    if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
    if (!canEditGuests(auth.role)) return NextResponse.json({ error: "Not allowed." }, { status: 403 });

    const key = url.searchParams.get("segment");
    const consentParam = url.searchParams.get("consent");
    const consent = consentParam === "any" ? "any" : CONSENT_CHANNELS.find((c) => c === consentParam) ?? null;

    let label = "all-guests";
    let rules = {};
    if (key) {
      const found = await rulesForKey(auth.service, auth.tenant.id, key);
      if (!found) return NextResponse.json({ error: "That segment wasn't found." }, { status: 404 });
      label = found.label;
      rules = found.rules;
    }

    const pool = await loadSegmentPool(auth.service, auth.tenant.id);
    const now = new Date();
    const members = pool.filter((g) => !g.anonymised && matchesRules(rules, g, now));
    const csv = guestsToCsv(members, consent);
    const file = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}${consent ? `-${consent}-consent` : ""}.csv`;
    return new NextResponse(`﻿${csv}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${file}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "Could not export the guests." }, { status: 500 });
  }
}
