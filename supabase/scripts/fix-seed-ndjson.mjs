/**
 * Normalizes workspace-root seed_part_*.ndjson files to match XYVOO hotel schema
 * (hotel.room_units, hotel.guests, hotel.reservations, hotel.reservation_guests, hotel.folio_transactions).
 *
 * Run from repo: node supabase/scripts/fix-seed-ndjson.mjs
 * (cwd must be xyvoo-next)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HMS_ROOT = path.resolve(__dirname, "../../..");

function parseNdjsonFiles() {
  const parts = [];
  for (let i = 1; i <= 6; i++) {
    const fp = path.join(HMS_ROOT, `seed_part_${i}.ndjson`);
    const raw = fs.readFileSync(fp, "utf8");
    const lines = raw.split(/\r?\n/);
    const records = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t || t.startsWith("TENANT_ID") || t.startsWith("---")) continue;
      try {
        records.push(JSON.parse(t));
      } catch {
        console.warn(`Skip non-JSON line in part ${i}: ${line.slice(0, 80)}`);
      }
    }
    parts.push({ i, fp, records });
  }
  return parts;
}

function classify(row) {
  if (row.kind != null && (row.kind === "charge" || row.kind === "payment" || row.kind === "discount" || row.kind === "refund" || row.kind === "transfer")) {
    return "folio";
  }
  if (row.room_code != null && row.floor != null) return "room_unit";
  if (row.confirmation_code != null) return "reservation";
  if (row.reservation_id != null && row.guest_id != null && row.is_primary != null) return "reservation_guest";
  if (row.id_type != null && row.first_name != null) return "guest";
  return "unknown";
}

function bookingChannelFromSource(source) {
  const m = {
    walk_in: "Walk-in",
    phone: "Phone",
    referral: "Referral",
    ota: "OTA",
    website: "Web",
    travel_agent: "Travel agent",
  };
  return m[source] ?? "Web";
}

function fixRoomUnit(row) {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    room_code: row.room_code,
    floor: row.floor,
    room_type_code: row.room_type_code,
    status: row.status,
    notes: row.notes ?? null,
    created_at: row.created_at ?? "2025-01-01T00:00:00.000Z",
  };
}

function fixGuest(row) {
  let nat = String(row.nationality ?? "NG").toUpperCase().replace(/[^A-Z]/g, "");
  if (nat.length >= 2) nat = nat.slice(0, 2);
  else nat = "NG";

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    title: row.title ?? "Mr",
    first_name: row.first_name,
    last_name: row.last_name,
    nationality: nat,
    id_type: row.id_type,
    id_number: row.id_number,
    id_expiry_date: row.id_expiry_date ?? "2030-12-31",
    date_of_birth: row.date_of_birth,
    gender: row.gender ?? null,
    id_document_storage_path: null,
    phone: row.phone,
    email: row.email,
    whatsapp: row.whatsapp ?? null,
    preferred_channel: row.preferred_channel,
    tags: Array.isArray(row.tags) ? row.tags : [],
    created_at: row.created_at,
  };
}

function parseChildrenJson(v) {
  if (v == null) return [];
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (Array.isArray(v)) return v;
  return [];
}

function fixReservation(row, roomTypeByUnitId) {
  const nightly = row.nightly_rate != null ? Number(row.nightly_rate) : Number(row.rate_per_night);
  const total = row.total_charges != null ? Number(row.total_charges) : Number(row.total_room_charges);
  /** Fallback when room_unit_id missing from map — Firefly Standard `room_types[].id` */
  const DEFAULT_ROOM_TYPE_ID = "3395f8e0-a192-4048-801a-fd28114b0bdd";
  const roomType = row.room_unit_id
    ? roomTypeByUnitId.get(row.room_unit_id) ?? DEFAULT_ROOM_TYPE_ID
    : row.room_type_code ?? DEFAULT_ROOM_TYPE_ID;
  const remarks = [row.special_requests, row.notes].filter(Boolean).join(" — ") || null;

  const checkedIn = row.checked_in_at != null;
  const status = row.status;

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    confirmation_code: row.confirmation_code,
    status,
    arrival_at: row.arrival_at,
    departure_at: row.departure_at,
    nights: row.nights,
    adults: row.adults,
    children_json: parseChildrenJson(row.children_json),
    purpose_of_visit: row.purpose_of_visit,
    room_type_code: roomType,
    room_unit_id: row.room_unit_id ?? null,
    room_preferences_text: row.room_preferences_text ?? row.special_requests ?? null,
    rate_type: row.rate_type,
    season_code: row.season_code ?? null,
    rate_per_night: nightly,
    total_room_charges: total,
    rate_overridden: row.rate_overridden ?? false,
    rate_override_reason: row.rate_override_reason ?? null,
    show_rate_on_registration_card: row.show_rate_on_registration_card ?? true,
    vat_applicable: row.vat_applicable ?? true,
    tax_exempt: row.tax_exempt ?? false,
    tax_exemption_reason: row.tax_exemption_reason ?? null,
    tax_exemption_doc_ref: row.tax_exemption_doc_ref ?? null,
    settlement_method: row.settlement_method,
    preauth_amount: row.preauth_amount ?? null,
    bill_to_account: row.bill_to_account ?? null,
    po_number: row.po_number ?? null,
    folio_split_notes: row.folio_split_notes ?? null,
    min_payment_per_day: row.min_payment_per_day ?? null,
    booking_channel: row.booking_channel ?? bookingChannelFromSource(row.source),
    market_segment: row.market_segment,
    source: row.source,
    travel_agent_name: row.travel_agent_name ?? null,
    commission_plan: row.commission_plan ?? null,
    commission_value: row.commission_value ?? null,
    guest_remarks: remarks,
    room_setup_notes: row.room_setup_notes ?? null,
    dietary_notes: row.dietary_notes ?? null,
    accessibility_notes: row.accessibility_notes ?? null,
    vip_flag: row.vip_flag ?? false,
    vip_notes: row.vip_notes ?? null,
    special_occasion: row.special_occasion ?? null,
    immigration_registration_required: row.immigration_registration_required ?? false,
    voucher_number: row.voucher_number ?? null,
    registration_card_signed: row.registration_card_signed ?? (checkedIn || status === "checked_out"),
    generate_bill: row.generate_bill ?? true,
    folio_number: row.folio_number,
    registration_number: row.registration_number,
    checked_in_at: row.checked_in_at ?? null,
    checked_out_at: row.checked_out_at ?? null,
    checked_in_by_staff_id: row.checked_in_by_staff_id ?? null,
    digital_key_issued: row.digital_key_issued ?? (checkedIn && status === "checked_in"),
    created_at: row.created_at,
    group_booking_id: row.group_booking_id ?? null,
  };
}

function fixReservationGuest(row) {
  return {
    id: row.id,
    reservation_id: row.reservation_id,
    guest_id: row.guest_id,
    is_primary: row.is_primary,
    relationship: row.relationship ?? null,
  };
}

function fixFolio(row) {
  const amt = typeof row.amount === "string" ? Number(row.amount) : Number(row.amount);
  const split = row.split_leg == null || row.split_leg === "" ? "guest" : row.split_leg;
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    reservation_id: row.reservation_id,
    kind: row.kind,
    amount: amt,
    method: row.method,
    status: row.status ?? "posted",
    description: row.description ?? null,
    department: row.department ?? null,
    split_leg: split,
    currency_code: row.currency_code ?? "NGN",
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    reference: row.reference ?? null,
    created_at: row.created_at,
  };
}

function main() {
  const parts = parseNdjsonFiles();
  const roomTypeByUnitId = new Map();

  for (const { records } of parts) {
    for (const row of records) {
      if (classify(row) === "room_unit") {
        roomTypeByUnitId.set(row.id, row.room_type_code);
      }
    }
  }

  const outParts = [];
  for (const { i, fp, records } of parts) {
    const transformed = [];
    for (const row of records) {
      const kind = classify(row);
      switch (kind) {
        case "room_unit":
          transformed.push(fixRoomUnit(row));
          break;
        case "guest":
          transformed.push(fixGuest(row));
          break;
        case "reservation":
          transformed.push(fixReservation(row, roomTypeByUnitId));
          break;
        case "reservation_guest":
          transformed.push(fixReservationGuest(row));
          break;
        case "folio":
          transformed.push(fixFolio(row));
          break;
        default:
          console.warn(`Unknown row type in part ${i}, keys: ${Object.keys(row).join(",")}`);
      }
    }
    outParts.push({ i, fp, transformed, originalCount: records.length });
  }

  // Re-split into 6 files with similar grouping as original (part1 rooms+guests, 2-4 reservations, 5 rg+folio1, 6 folio2)
  // Easier: dump all into structured single pass - user wanted "files" fixed. We'll re-emit same part boundaries:
  const all = outParts.flatMap((p) => p.transformed);
  const rooms = all.filter((r) => r.room_code != null);
  const guests = all.filter((r) => r.id_type != null && r.first_name != null);
  const reservations = all.filter((r) => r.confirmation_code != null);
  const rgs = all.filter((r) => r.reservation_id != null && r.guest_id != null && r.is_primary != null && r.confirmation_code == null && r.kind == null);
  const folios = all.filter((r) => r.kind != null);

  const p1 = [...rooms, ...guests];
  const nRes = reservations.length;
  const third = Math.ceil(nRes / 3);
  const resA = reservations.slice(0, third);
  const resB = reservations.slice(third, 2 * third);
  const resC = reservations.slice(2 * third);
  const halfF = Math.ceil(folios.length / 2);
  const folA = folios.slice(0, halfF);
  const folB = folios.slice(halfF);

  const bundles = [
    { i: 1, label: "room_units + guests", rows: p1 },
    { i: 2, label: "reservations (1st third)", rows: resA },
    { i: 3, label: "reservations (2nd third)", rows: resB },
    { i: 4, label: "reservations (3rd third)", rows: resC },
    { i: 5, label: "reservation_guests + folio (1st half)", rows: [...rgs, ...folA] },
    { i: 6, label: "folio_transactions (2nd half)", rows: folB },
  ];

  for (const b of bundles) {
    const header = [
      "TENANT_ID_PLACEHOLDER: {{TENANT_UUID}}",
      "",
      `--- PART ${b.i} of 6 — ${b.label} (schema-aligned) ---`,
      "",
    ].join("\n");
    const body = b.rows.map((r) => JSON.stringify(r)).join("\n");
    const fp = path.join(HMS_ROOT, `seed_part_${b.i}.ndjson`);
    fs.writeFileSync(fp, `${header}${body}\n`, "utf8");
    console.log(`Wrote ${b.rows.length} rows -> ${fp}`);
  }

  console.log("Done. Replace {{TENANT_UUID}} with your tenant id before loading.");
}

main();
