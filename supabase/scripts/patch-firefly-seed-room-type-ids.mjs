/**
 * Rewrites seed.firefly.sql: hotel.room_units.room_type_code + reservations.room_type_code
 * use public.tenants.room_types[].id values for Firefly (same ids as HotelRoomPricingSetup).
 *
 * Inventory mix (71 keys, numeric room_code order): Standard 14, Super Standard 18, Queen 11, King 16, Suite 12.
 *
 * Run from xyvoo-next: node supabase/scripts/patch-firefly-seed-room-type-ids.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL = path.join(__dirname, "..", "seed.firefly.sql");

const RT = {
  standard: "3395f8e0-a192-4048-801a-fd28114b0bdd",
  superStandard: "e957016a-5bfe-4822-aad1-d06926850cc2",
  queen: "9c7846c8-f51f-4013-8e09-bfab4a202429",
  king: "bd94f32a-0d1b-498d-b020-97440a375571",
  suite: "246f11af-e886-421b-a3c4-dec34e46b8be",
};

const LEGACY = {
  STD: RT.standard,
  DLX: RT.king,
  JST: RT.queen,
  STE: RT.suite,
};

const allIds = new Set(Object.values(RT));

let text = fs.readFileSync(SQL, "utf8");

const roomLines = text.split(/\r?\n/).filter((l) => l.trim().startsWith("('a0000001-"));
const rooms = [];
for (const line of roomLines) {
  const m = line.match(
    /'41604dc6-9ce1-49bd-a0bb-5aa777ec7463',\s*'(\d+)',\s*\d+,\s*'([^']+)'/,
  );
  if (!m) continue;
  rooms.push({ room_code: m[1], oldType: m[2] });
}
if (rooms.length !== 71) {
  throw new Error(`Expected 71 room rows, got ${rooms.length}`);
}

const sortedCodes = [...new Set(rooms.map((r) => r.room_code))].sort(
  (a, b) => parseInt(a, 10) - parseInt(b, 10),
);
if (sortedCodes.length !== 71) throw new Error("room_code set size !== 71");

/** @type {Record<string, string>} */
const codeToType = {};
sortedCodes.slice(0, 14).forEach((c) => {
  codeToType[c] = RT.standard;
});
sortedCodes.slice(14, 32).forEach((c) => {
  codeToType[c] = RT.superStandard;
});
sortedCodes.slice(32, 43).forEach((c) => {
  codeToType[c] = RT.queen;
});
sortedCodes.slice(43, 59).forEach((c) => {
  codeToType[c] = RT.king;
});
sortedCodes.slice(59, 71).forEach((c) => {
  codeToType[c] = RT.suite;
});

/** room_unit id -> room_type id */
const idToType = {};
for (const line of roomLines) {
  const idM = line.match(/^\('([a-f0-9-]{36})',\s*'41604dc6-9ce1-49bd-a0bb-5aa777ec7463',\s*'(\d+)'/i);
  if (!idM) continue;
  const id = idM[1].toLowerCase();
  const code = idM[2];
  idToType[id] = codeToType[code];
}

function patchRoomLine(line) {
  return line.replace(
    /('41604dc6-9ce1-49bd-a0bb-5aa777ec7463',\s*'\d+',\s*\d+,\s*)'[^']+'(\s*,\s*')/,
    (_, prefix, after) => {
      const m = line.match(/'41604dc6-9ce1-49bd-a0bb-5aa777ec7463',\s*'(\d+)'/);
      const rc = m?.[1];
      const t = rc ? codeToType[rc] : RT.standard;
      return `${prefix}'${t}'${after}`;
    },
  );
}

for (const line of roomLines) {
  text = text.replace(line, patchRoomLine(line));
}

const resLineRe =
  /^ '(leisure|business|transit)',\s*'([^']+)',\s*(null|'a0000001-0000-4000-8000-[a-f0-9]{12}'),/gim;

text = text.replace(resLineRe, (full, purpose, typeOrId, roomRef) => {
  let t = null;
  if (roomRef !== "null") {
    const rid = roomRef.replace(/'/g, "").toLowerCase();
    t = idToType[rid];
  }
  if (!t) {
    if (LEGACY[typeOrId]) t = LEGACY[typeOrId];
    else if (allIds.has(typeOrId)) t = typeOrId;
    else t = RT.standard;
  }
  return ` '${purpose}', '${t}', ${roomRef},`;
});

fs.writeFileSync(SQL, text, "utf8");
console.log("Patched", SQL);
