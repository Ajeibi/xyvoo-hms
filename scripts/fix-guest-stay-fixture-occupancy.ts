/**
 * Rewrites guest-stay JSON fixtures so adults + children respect room type max occupancy.
 *
 * Usage: npx tsx scripts/fix-guest-stay-fixture-occupancy.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { clampStayOccupancy, stayHeadcount } from "../src/lib/hms/seed/clamp-stay-occupancy";
import {
  FIREFLY_MAX_OCCUPANCY,
  fireflyMaxOccupancyForRoomCode,
  fireflyRoomCodeToTypeId,
} from "../src/lib/hms/seed/firefly-inventory";
import type { GuestStaysSampleFile } from "../src/lib/hms/seed/samples/guest-stays-sample.types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "../src/lib/hms/seed/samples/guest-stays");

function resolveMaxForStay(stay: GuestStaysSampleFile["stays"][number]): number {
  if (stay.room_code) {
    return fireflyMaxOccupancyForRoomCode(stay.room_code);
  }
  if (stay.room_type_code) {
    return FIREFLY_MAX_OCCUPANCY[stay.room_type_code] ?? 2;
  }
  return 2;
}

function fixFile(filePath: string): number {
  const raw = fs.readFileSync(filePath, "utf8");
  const fixture = JSON.parse(raw) as GuestStaysSampleFile;
  let fixes = 0;

  for (const stay of fixture.stays) {
    const max = resolveMaxForStay(stay);
    const before = stayHeadcount(stay.adults, stay.children);
    if (before <= max) continue;

    const clamped = clampStayOccupancy(stay.adults, stay.children ?? [], max);
    stay.adults = clamped.adults;
    stay.children = clamped.children;
    fixes += 1;
    console.log(
      `  ${stay.ref}: ${before} → ${stayHeadcount(stay.adults, stay.children)} (max ${max}, room ${stay.room_code ?? stay.room_type_code ?? "?"})`,
    );
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
    const p = path.join(FIXTURE_DIR, f);
    console.log(path.basename(p));
    total += fixFile(p);
  }
  console.log(`\nFixed ${total} stay(s) across ${files.length} file(s).`);
  console.log("Room type reference:", fireflyRoomCodeToTypeId("101"), "= Standard (max 1)");
}

main();
