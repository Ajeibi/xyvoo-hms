/**
 * Replaces 20-room block in seed_part_1.ndjson with 71 rooms from seed.firefly.sql
 * and remaps reservation room_unit_id (+ room_type_code) across seed_part_2..6.
 * Room types come from seed.firefly.sql (`room_type_code` = tenant `room_types[].id` UUIDs).
 *
 * Run from xyvoo-next: node supabase/scripts/expand-ndjson-firefly-rooms.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XYVOO_NEXT = path.resolve(__dirname, "../..");
const HMS_ROOT = path.resolve(XYVOO_NEXT, "..");
const FIREFLY_SQL = path.join(XYVOO_NEXT, "supabase", "seed.firefly.sql");

const ROOM_CREATED_AT = "2026-01-01T00:00:00.000Z";

/** ~80% occupied; remainder mix vacant / HK / OOO for a realistic floor. */
const TARGET_OCCUPIED_FRACTION = 0.8;

/**
 * @param {Array<{ id: string; room_code: string; floor: number; room_type_code: string; status: string; notes: string | null }>} rooms
 */
function applyOccupancyDistribution(rooms) {
  const sorted = [...rooms].sort((a, b) => Number(a.room_code) - Number(b.room_code));
  const nOcc = Math.round(sorted.length * TARGET_OCCUPIED_FRACTION);
  const vacantCycle = [
    "vacant_clean",
    "dirty",
    "inspected",
    "vacant_clean",
    "vacant_clean",
    "dirty",
    "inspected",
    "vacant_clean",
    "maintenance",
    "vacant_clean",
    "dirty",
    "inspected",
    "vacant_clean",
    "out_of_order",
  ];
  return sorted.map((r, i) => {
    if (i < nOcc) {
      return { ...r, status: "occupied", notes: null };
    }
    const st = vacantCycle[(i - nOcc) % vacantCycle.length];
    const notes = st === "out_of_order" ? "Plumbing" : st === "maintenance" ? "AC repair" : null;
    return { ...r, status: st, notes };
  });
}

function parseFireflyRooms() {
  const lines = fs.readFileSync(FIREFLY_SQL, "utf8").split(/\r?\n/);
  const rooms = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t.startsWith("('a0000001-")) continue;
    const m = t.match(
      /^\('([a-f0-9-]{36})',\s*'41604dc6-9ce1-49bd-a0bb-5aa777ec7463',\s*'([^']+)',\s*(\d+),\s*'([^']+)',\s*'([^']+)',\s*(null|'[^']*')\)\s*,?\s*;?\s*$/,
    );
    if (!m) continue;
    let notes = m[6];
    if (notes === "null") notes = null;
    else notes = notes.slice(1, -1).replace(/''/g, "'");
    rooms.push({
      id: m[1],
      room_code: m[2],
      floor: Number(m[3]),
      room_type_code: m[4],
      status: m[5],
      notes,
    });
  }
  if (rooms.length !== 71) {
    throw new Error(`Expected 71 Firefly rooms, parsed ${rooms.length} from ${FIREFLY_SQL}`);
  }
  return rooms;
}

function parseNdjsonLines(filePath) {
  const out = [];
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("TENANT_ID") || t.startsWith("---")) {
      out.push({ type: "raw", line });
      continue;
    }
    try {
      out.push({ type: "json", obj: JSON.parse(t), line });
    } catch {
      out.push({ type: "raw", line });
    }
  }
  return out;
}

function loadOldRoomIdToCode(part1Path) {
  const map = {};
  for (const item of parseNdjsonLines(part1Path)) {
    if (item.type !== "json") continue;
    const r = item.obj;
    if (r.room_code != null && r.floor != null && r.id) {
      map[r.id] = String(r.room_code);
    }
  }
  return map;
}

function buildRemap(oldIdToCode, roomsByCode) {
  const oldToNew = {};
  for (const [oldId, code] of Object.entries(oldIdToCode)) {
    const fr = roomsByCode.get(code);
    if (!fr) {
      throw new Error(`No Firefly room for code ${code} (old id ${oldId})`);
    }
    oldToNew[oldId] = fr.id;
  }
  return oldToNew;
}

function remapReservation(row, oldToNew, roomsById) {
  const rid = row.room_unit_id;
  if (rid == null) return row;
  const newId = oldToNew[rid];
  if (!newId) return row;
  const meta = roomsById.get(newId);
  return {
    ...row,
    room_unit_id: newId,
    room_type_code: meta ? meta.room_type_code : row.room_type_code,
  };
}

function main() {
  const fireflyRooms = applyOccupancyDistribution(parseFireflyRooms());
  const roomsByCode = new Map(fireflyRooms.map((r) => [r.room_code, r]));
  const roomsById = new Map(fireflyRooms.map((r) => [r.id, r]));

  const part1Path = path.join(HMS_ROOT, "seed_part_1.ndjson");
  const oldIdToCode = loadOldRoomIdToCode(part1Path);
  const oldToNew = buildRemap(oldIdToCode, roomsByCode);

  const newRoomLines = fireflyRooms.map((r) =>
    JSON.stringify({
      id: r.id,
      tenant_id: "{{TENANT_UUID}}",
      room_code: r.room_code,
      floor: r.floor,
      room_type_code: r.room_type_code,
      status: r.status,
      notes: r.notes,
      created_at: ROOM_CREATED_AT,
    }),
  );

  const part1Items = parseNdjsonLines(part1Path);
  const guestLines = [];
  for (const item of part1Items) {
    if (item.type !== "json") continue;
    const r = item.obj;
    if (r.id_type != null && r.first_name != null) {
      guestLines.push(JSON.stringify(r));
    }
  }

  const part1Out = [
    "TENANT_ID_PLACEHOLDER: {{TENANT_UUID}}",
    "",
    "--- PART 1 of 6 — room_units (71) + guests (schema-aligned) ---",
    "",
    ...newRoomLines,
    ...guestLines,
  ];
  fs.writeFileSync(part1Path, part1Out.join("\n") + "\n", "utf8");
  const occ = fireflyRooms.filter((r) => r.status === "occupied").length;
  console.log(
    `Wrote ${part1Path} (${newRoomLines.length} rooms, ${guestLines.length} guests; ${occ} occupied ≈${((occ / fireflyRooms.length) * 100).toFixed(0)}%)`,
  );

  for (let p = 2; p <= 6; p++) {
    const fp = path.join(HMS_ROOT, `seed_part_${p}.ndjson`);
    const items = parseNdjsonLines(fp);
    const linesOut = [];
    let nRemap = 0;
    for (const item of items) {
      if (item.type === "raw") {
        linesOut.push(item.line);
        continue;
      }
      let o = item.obj;
      if (o.confirmation_code != null && o.room_unit_id != null && oldToNew[o.room_unit_id]) {
        o = remapReservation(o, oldToNew, roomsById);
        nRemap++;
      }
      linesOut.push(JSON.stringify(o));
    }
    fs.writeFileSync(fp, linesOut.join("\n") + "\n", "utf8");
    console.log(`Wrote ${fp} (remapped ${nRemap} reservation room refs)`);
  }

  console.log("Done. Re-run: node supabase/scripts/load-seed-ndjson.mjs --wipe-first");
}

main();
