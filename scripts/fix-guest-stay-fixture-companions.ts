/**
 * Ensures every stay fixture has companion guest profiles for all adults (beyond primary)
 * and all children — matching manual walk-in check-in.
 *
 * Usage: npx tsx scripts/fix-guest-stay-fixture-companions.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { clampStayOccupancy } from "../src/lib/hms/seed/clamp-stay-occupancy";
import { resolveStayGuests } from "../src/lib/hms/seed/expand-stay-guests";
import { fireflyMaxOccupancyForRoomCode } from "../src/lib/hms/seed/firefly-inventory";
import type { GuestStaysSampleFile, StaySample } from "../src/lib/hms/seed/samples/guest-stays-sample.types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "../src/lib/hms/seed/samples/guest-stays");

function stayKey(ref: string): number {
  const n = Number(ref.replace(/\D/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Invalid stay ref: ${ref}`);
  return n;
}

function enrichStay(stay: StaySample): boolean {
  const sk = stayKey(stay.ref);
  const max =
    stay.room_code != null ? fireflyMaxOccupancyForRoomCode(stay.room_code) : 2;
  const clamped = clampStayOccupancy(stay.adults, stay.children ?? [], max);
  const beforeAdults = stay.adults;
  const beforeChildrenLen = stay.children?.length ?? 0;
  const beforeCompanions = stay.companions?.length ?? 0;

  stay.adults = clamped.adults;
  stay.children = clamped.children;

  const resolved = resolveStayGuests(stay, sk, clamped.adults, clamped.children);
  const companions = resolved
    .filter((g) => !g.isPrimary)
    .map((g) => ({
      relationship: g.relationship,
      guest: g.profile,
    }));

  stay.companions = companions.length ? companions : undefined;

  const changed =
    beforeAdults !== stay.adults ||
    beforeChildrenLen !== (stay.children?.length ?? 0) ||
    beforeCompanions !== (stay.companions?.length ?? 0);

  if (changed) {
    console.log(
      `  ${stay.ref}: ${beforeCompanions} → ${companions.length} companion(s), adults ${beforeAdults}→${stay.adults}, children ${beforeChildrenLen}→${stay.children?.length ?? 0}`,
    );
  }
  return changed;
}

function fixFile(filePath: string): number {
  const fixture = JSON.parse(fs.readFileSync(filePath, "utf8")) as GuestStaysSampleFile;
  let fixes = 0;
  for (const stay of fixture.stays) {
    if (enrichStay(stay)) fixes += 1;
  }
  if (fixes > 0) {
    fs.writeFileSync(filePath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  }
  return fixes;
}

function main() {
  const files = fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"));
  let total = 0;
  for (const f of files) {
    console.log(path.basename(f));
    total += fixFile(path.join(FIXTURE_DIR, f));
  }
  console.log(`\nEnriched ${total} stay(s) across ${files.length} file(s).`);
}

main();
