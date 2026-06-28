/**
 * Load workspace-root seed_part_1..6.ndjson into Supabase (schema hotel).
 *
 * Prerequisites:
 *   - xyvoo-next/.env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 *   - seed_part_*.ndjson at repo root (XYVOO HMS/, sibling of xyvoo-next/)
 *
 * Usage (cwd = xyvoo-next):
 *   node supabase/scripts/load-seed-ndjson.mjs --wipe-first
 *   node supabase/scripts/load-seed-ndjson.mjs --wipe-first <tenant-uuid>
 *
 * Default tenant: Firefly 41604dc6-9ce1-49bd-a0bb-5aa777ec7463
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XYVOO_NEXT = path.resolve(__dirname, "../..");
const HMS_ROOT = path.resolve(XYVOO_NEXT, "..");

const DEFAULT_TENANT_ID = "41604dc6-9ce1-49bd-a0bb-5aa777ec7463";
const PLACEHOLDER = "{{TENANT_UUID}}";

function loadEnvLocal() {
  const p = path.join(XYVOO_NEXT, ".env.local");
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
  }
}

function parseAllRecords() {
  const records = [];
  for (let i = 1; i <= 6; i++) {
    const fp = path.join(HMS_ROOT, `seed_part_${i}.ndjson`);
    if (!fs.existsSync(fp)) {
      throw new Error(`Missing ${fp}`);
    }
    const raw = fs.readFileSync(fp, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("TENANT_ID") || t.startsWith("---")) continue;
      try {
        records.push(JSON.parse(t));
      } catch {
        /* skip non-JSON */
      }
    }
  }
  return records;
}

function classify(row) {
  if (
    row.kind != null &&
    ["charge", "payment", "discount", "refund", "transfer"].includes(row.kind)
  ) {
    return "folio";
  }
  if (row.room_code != null && row.floor != null) return "room_unit";
  if (row.confirmation_code != null) return "reservation";
  if (row.reservation_id != null && row.guest_id != null && typeof row.is_primary === "boolean") {
    return "reservation_guest";
  }
  if (row.id_type != null && row.first_name != null) return "guest";
  return "unknown";
}

function applyTenantId(row, tenantId) {
  const o = { ...row };
  if (o.tenant_id === PLACEHOLDER) o.tenant_id = tenantId;
  return o;
}

function pickRoomUnit(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    room_code: row.room_code,
    floor: row.floor,
    room_type_code: row.room_type_code,
    status: row.status,
    notes: row.notes ?? null,
    ...(row.created_at != null ? { created_at: row.created_at } : {}),
  };
}

function pickGuest(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    title: row.title ?? null,
    first_name: row.first_name,
    last_name: row.last_name,
    nationality: row.nationality,
    id_type: row.id_type,
    id_number: row.id_number,
    id_expiry_date: row.id_expiry_date,
    date_of_birth: row.date_of_birth,
    gender: row.gender ?? null,
    id_document_storage_path: row.id_document_storage_path ?? null,
    phone: row.phone,
    email: row.email,
    whatsapp: row.whatsapp ?? null,
    preferred_channel: row.preferred_channel,
    tags: row.tags ?? [],
    ...(row.created_at != null ? { created_at: row.created_at } : {}),
  };
}

function pickReservation(row) {
  const o = { ...row };
  for (const k of Object.keys(o)) {
    if (o[k] === undefined) delete o[k];
  }
  return o;
}

function pickReservationGuest(row) {
  return {
    id: row.id,
    reservation_id: row.reservation_id,
    guest_id: row.guest_id,
    is_primary: row.is_primary,
    relationship: row.relationship ?? null,
  };
}

function pickFolio(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    reservation_id: row.reservation_id,
    kind: row.kind,
    amount: row.amount,
    method: row.method,
    status: row.status,
    description: row.description ?? null,
    department: row.department ?? null,
    split_leg: row.split_leg ?? "guest",
    currency_code: row.currency_code ?? "NGN",
    metadata: row.metadata ?? {},
    reference: row.reference ?? null,
    ...(row.created_at != null ? { created_at: row.created_at } : {}),
  };
}

async function wipeTenantHotel(supabase, tenantId) {
  const h = () => supabase.schema("hotel");
  const del = async (table) => {
    const { error } = await h().from(table).delete().eq("tenant_id", tenantId);
    if (error) throw new Error(`delete ${table}: ${error.message}`);
  };

  await del("reservations");
  await del("guests");
  await del("group_bookings");
  await del("housekeeping_tasks");
  await del("room_blocks");
  await del("room_key_events");
  await del("room_incidents");
  await del("room_unit_notes");
  await del("notifications");
  await del("room_units");
}

async function insertBatched(supabase, table, rows, batchSize = 75) {
  if (rows.length === 0) return;
  const tbl = supabase.schema("hotel").from(table);
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await tbl.insert(chunk);
    if (error) {
      throw new Error(`insert ${table} rows ${i}-${i + chunk.length}: ${error.message} (${error.code})`);
    }
    console.log(`  ${table}: ${Math.min(i + batchSize, rows.length)} / ${rows.length}`);
  }
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in xyvoo-next/.env.local (service role).",
    );
    process.exit(1);
  }

  const wipeFirst = process.argv.includes("--wipe-first") || process.argv.includes("--wipe");
  const uuidArg = process.argv.find((a) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(a),
  );
  const tenantId = uuidArg ?? DEFAULT_TENANT_ID;

  console.log(`Tenant: ${tenantId}`);
  console.log(`NDJSON dir: ${HMS_ROOT}`);
  console.log(`Wipe first: ${wipeFirst}`);

  const raw = parseAllRecords();
  const room_units = [];
  const guests = [];
  const reservations = [];
  const reservation_guests = [];
  const folio_transactions = [];

  for (const row of raw) {
    const t = applyTenantId(row, tenantId);
    switch (classify(t)) {
      case "room_unit":
        room_units.push(pickRoomUnit(t));
        break;
      case "guest":
        guests.push(pickGuest(t));
        break;
      case "reservation":
        reservations.push(pickReservation(t));
        break;
      case "reservation_guest":
        reservation_guests.push(pickReservationGuest(t));
        break;
      case "folio":
        folio_transactions.push(pickFolio(t));
        break;
      default:
        console.warn("Skipped unknown row:", Object.keys(row).join(","));
    }
  }

  console.log(
    `Parsed: ${room_units.length} room_units, ${guests.length} guests, ${reservations.length} reservations, ${reservation_guests.length} reservation_guests, ${folio_transactions.length} folio_transactions`,
  );

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  if (wipeFirst) {
    console.log("Wiping hotel rows for tenant (including room_units)…");
    await wipeTenantHotel(supabase, tenantId);
    console.log("Wipe done.");
  }

  console.log("Inserting…");
  await insertBatched(supabase, "room_units", room_units);
  await insertBatched(supabase, "guests", guests);
  await insertBatched(supabase, "reservations", reservations);
  await insertBatched(supabase, "reservation_guests", reservation_guests);
  await insertBatched(supabase, "folio_transactions", folio_transactions);

  console.log("Done.");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
