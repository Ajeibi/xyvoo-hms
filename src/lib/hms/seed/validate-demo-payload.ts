import { buildDemoSeedPayload } from "./build-demo-data";
import { DEMO_ORDER_PREFIX } from "./demo-markers";
import { DEMO_SCHEMA_FIELD_MAP, type DemoTenantContext } from "./demo-schema";

const MOCK_CTX: DemoTenantContext = {
  tenantId: "00000000-0000-4000-8000-000000000099",
  roomTypeCode: "deluxe",
  roomUnitId: "00000000-0000-4000-8000-000000000088",
  currency: "NGN",
};

type PayloadKey =
  | "guests"
  | "groupBookings"
  | "reservations"
  | "reservationGuests"
  | "folioTransactions"
  | "tenantFbSettings"
  | "fbOutlets"
  | "fbStations"
  | "fbMenuCategories"
  | "fbMenuItems"
  | "fbTables"
  | "fbOrders"
  | "fbOrderItems";

const PAYLOAD_TABLE_MAP: { table: keyof typeof DEMO_SCHEMA_FIELD_MAP; key: PayloadKey; plural: boolean }[] = [
  { table: "hotel.guests", key: "guests", plural: true },
  { table: "hotel.group_bookings", key: "groupBookings", plural: true },
  { table: "hotel.reservations", key: "reservations", plural: true },
  { table: "hotel.reservation_guests", key: "reservationGuests", plural: true },
  { table: "hotel.folio_transactions", key: "folioTransactions", plural: true },
  { table: "hotel.tenant_fb_settings", key: "tenantFbSettings", plural: false },
  { table: "hotel.fb_outlets", key: "fbOutlets", plural: true },
  { table: "hotel.fb_stations", key: "fbStations", plural: true },
  { table: "hotel.fb_menu_categories", key: "fbMenuCategories", plural: true },
  { table: "hotel.fb_menu_items", key: "fbMenuItems", plural: true },
  { table: "hotel.fb_tables", key: "fbTables", plural: true },
  { table: "hotel.fb_orders", key: "fbOrders", plural: true },
  { table: "hotel.fb_order_items", key: "fbOrderItems", plural: true },
];

export type DemoPayloadValidation = {
  ok: boolean;
  errors: string[];
  summary: { table: string; rows: number; columns: number }[];
};

export function validateDemoSeedPayload(ctx: DemoTenantContext = MOCK_CTX): DemoPayloadValidation {
  const payload = buildDemoSeedPayload(ctx);
  const errors: string[] = [];
  const summary: DemoPayloadValidation["summary"] = [];

  for (const { table, key, plural } of PAYLOAD_TABLE_MAP) {
    const expected = [...DEMO_SCHEMA_FIELD_MAP[table]];
    const rows = plural
      ? (payload[key] as Record<string, unknown>[])
      : [payload[key] as Record<string, unknown>];

    summary.push({ table, rows: rows.length, columns: expected.length });

    rows.forEach((row, rowIdx) => {
      const keys = new Set(Object.keys(row));
      for (const col of expected) {
        if (!keys.has(col)) {
          errors.push(`${table} row ${rowIdx}: missing column "${col}"`);
        }
      }
      for (const col of keys) {
        if (!expected.includes(col as (typeof expected)[number])) {
          errors.push(`${table} row ${rowIdx}: unexpected column "${col}"`);
        }
      }
      for (const col of expected) {
        if (row[col] === undefined) {
          errors.push(`${table} row ${rowIdx}: column "${col}" is undefined (use null for nullable)`);
        }
      }
    });
  }

  const roomChargeOrders = payload.fbOrders.filter(
    (o) => o.status === "closed" && o.settlement_method === "room_charge",
  );
  for (const order of roomChargeOrders) {
    const orderNumber = String(order.order_number);
    const suffix = orderNumber.replace(DEMO_ORDER_PREFIX, "");
    const match = payload.folioTransactions.find(
      (tx) =>
        tx.kind === "charge" &&
        tx.reference === `DEMO-FB-CHG-${suffix}` &&
        tx.reservation_id === order.reservation_id,
    );
    if (!match) {
      errors.push(
        `folio linkage: closed room_charge order ${orderNumber} has no matching folio charge`,
      );
      continue;
    }
    if (Number(match.amount) !== Number(order.subtotal)) {
      errors.push(
        `folio linkage: order ${orderNumber} subtotal ${order.subtotal} != folio amount ${match.amount}`,
      );
    }
    if (match.created_at !== order.closed_at) {
      errors.push(
        `folio linkage: order ${orderNumber} closed_at does not match folio created_at`,
      );
    }
  }

  return { ok: errors.length === 0, errors, summary };
}
