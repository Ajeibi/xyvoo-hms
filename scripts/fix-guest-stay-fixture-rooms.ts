/**
 * Rewrites guest-stay JSON fixtures to use only real firefly room codes.
 *
 * Usage: npx tsx scripts/fix-guest-stay-fixture-rooms.ts
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { clampStayOccupancy, stayHeadcount } from "../src/lib/hms/seed/clamp-stay-occupancy";
import {
  FIREFLY_ROOM_UNITS,
  fireflyMaxOccupancyForRoomCode,
  isFireflyRoomCode,
} from "../src/lib/hms/seed/firefly-inventory";
import type { GuestStaysSampleFile } from "../src/lib/hms/seed/samples/guest-stays-sample.types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, "../src/lib/hms/seed/samples/guest-stays");

/** Distinct codes for checked-in stays — spread across types/floors. */
const CHECKED_IN_ROOM_CODES = [
  "50", "51", "100", "101", "106", "109", "114", "115", "117", "150",
  "157", "160", "200", "203", "205", "207", "210", "213", "214", "216",
];

/** Pool for historical checked-out stays (reuse allowed). */
const CHECKED_OUT_ROOM_CODES = [
  "52", "53", "102", "103", "112", "113", "116", "151", "152", "158",
  "159", "161", "201", "202", "204", "206", "208", "211", "212", "215",
];

function clampStay(stay: GuestStaysSampleFile["stays"][number]) {
  if (!stay.room_code) return;
  const max = fireflyMaxOccupancyForRoomCode(stay.room_code);
  const clamped = clampStayOccupancy(stay.adults, stay.children ?? [], max);
  stay.adults = clamped.adults;
  stay.children = clamped.children;
}

function fixFile(filePath: string): number {
  const raw = fs.readFileSync(filePath, "utf8");
  const fixture = JSON.parse(raw) as GuestStaysSampleFile;
  const status = fixture._meta?.status_filter ?? fixture.stays[0]?.status ?? "";
  let pool: string[] = [];
  if (status === "checked_in") pool = [...CHECKED_IN_ROOM_CODES];
  else if (status === "checked_out") pool = [...CHECKED_OUT_ROOM_CODES];

  let poolIdx = 0;
  let fixes = 0;

  for (const stay of fixture.stays) {
    if (status === "checked_in" && pool.length) {
      const assigned = pool[poolIdx % pool.length];
      poolIdx += 1;
      if (stay.room_code !== assigned) {
        console.log(`  ${stay.ref}: ${stay.room_code ?? "null"} → ${assigned}`);
        stay.room_code = assigned;
        fixes += 1;
      }
    } else if (stay.room_code && !isFireflyRoomCode(stay.room_code)) {
      if (!pool.length) {
        throw new Error(`${stay.ref}: invalid room ${stay.room_code} and no replacement pool for ${status}`);
      }
      const next = pool[poolIdx % pool.length];
      poolIdx += 1;
      console.log(`  ${stay.ref}: ${stay.room_code} → ${next}`);
      stay.room_code = next;
      fixes += 1;
    }

    if (!stay.room_code) continue;

    const before = stayHeadcount(stay.adults, stay.children);
    clampStay(stay);
    const after = stayHeadcount(stay.adults, stay.children);
    if (after !== before) {
      console.log(`  ${stay.ref}: occupancy ${before} → ${after} (room ${stay.room_code})`);
      fixes += 1;
    }
  }

  if (fixture._meta) {
    fixture._meta.firefly_room_codes =
      "50–63 (floor 1), 64–67 (floor 1), 100–117 (floor 2), 150–167 (floor 3), 200–216 (floor 4). Use only these keys.";
  }

  if (fixes > 0) {
    fs.writeFileSync(filePath, `${JSON.stringify(fixture, null, 2)}\n`, "utf8");
  }
  return fixes;
}

function main() {
  console.log(`Canonical firefly inventory: ${FIREFLY_ROOM_UNITS.length} rooms`);
  const files = fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith(".json"));
  let total = 0;
  for (const f of files) {
    console.log(path.basename(f));
    total += fixFile(path.join(FIXTURE_DIR, f));
  }
  console.log(`\nApplied ${total} fix(es) across ${files.length} file(s).`);
}

main();
