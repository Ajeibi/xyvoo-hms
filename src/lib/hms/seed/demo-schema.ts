/**
 * Authoritative column map for demo seed tables (hotel schema).
 * Every listed column is populated by buildDemoSeedPayload() unless noted.
 * Verified against supabase/migrations (through 20260722150000) via validate:demo.
 *
 * Not seeded here (system / signup): memberships, profiles, registration_*, public.tenants
 * Not seeded (out of demo scope): housekeeping, room_blocks, notifications, guest_requests, etc.
 */

export const DEMO_SCHEMA_TABLES = [
  "hotel.guests",
  "hotel.group_bookings",
  "hotel.reservations",
  "hotel.reservation_guests",
  "hotel.folio_transactions",
  "hotel.tenant_fb_settings",
  "hotel.fb_outlets",
  "hotel.fb_stations",
  "hotel.fb_menu_categories",
  "hotel.fb_menu_items",
  "hotel.fb_tables",
  "hotel.fb_orders",
  "hotel.fb_order_items",
] as const;

export type DemoSchemaTable = (typeof DEMO_SCHEMA_TABLES)[number];

/** Relative timestamp helpers — keeps history filters fresh. */
export function isoAgo(minutes: number) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

/** Timestamp on today's UTC calendar date at the given hour. */
export function isoTodayUtc(hourUtc: number, minuteUtc = 0) {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hourUtc, minuteUtc, 0, 0),
  ).toISOString();
}

export function isoFromNow(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

export function dateOnlyAgo(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export type DemoTenantContext = {
  tenantId: string;
  /** First room type id from tenant.room_types — required for reservations. */
  roomTypeCode: string;
  /** Optional physical room for in-house demo stay. */
  roomUnitId: string | null;
  currency: string;
};

/**
 * Column coverage map — every column in demo-seeded tables is set in build-demo-data.ts.
 * Nullable columns use null when not applicable; JSON columns use {} or structured objects.
 */
export const DEMO_SCHEMA_FIELD_MAP = {
  "hotel.guests": [
    "id",
    "tenant_id",
    "title",
    "first_name",
    "last_name",
    "nationality",
    "id_type",
    "id_number",
    "id_expiry_date",
    "date_of_birth",
    "gender",
    "id_document_storage_path",
    "phone",
    "email",
    "whatsapp",
    "preferred_channel",
    "tags",
    "created_at",
  ],
  "hotel.group_bookings": [
    "id",
    "tenant_id",
    "group_name",
    "coordinator_name",
    "coordinator_phone",
    "room_count",
    "shared_billing",
    "bill_to_account",
    "arrival_at",
    "departure_at",
    "notes",
    "created_at",
  ],
  "hotel.reservations": [
    "id",
    "tenant_id",
    "confirmation_code",
    "status",
    "arrival_at",
    "departure_at",
    "nights",
    "adults",
    "children_json",
    "purpose_of_visit",
    "room_type_code",
    "room_unit_id",
    "room_preferences_text",
    "rate_type",
    "season_code",
    "rate_per_night",
    "total_room_charges",
    "rate_overridden",
    "rate_override_reason",
    "show_rate_on_registration_card",
    "vat_applicable",
    "tax_exempt",
    "tax_exemption_reason",
    "tax_exemption_doc_ref",
    "settlement_method",
    "preauth_amount",
    "bill_to_account",
    "po_number",
    "folio_split_notes",
    "min_payment_per_day",
    "booking_channel",
    "market_segment",
    "source",
    "travel_agent_name",
    "commission_plan",
    "commission_value",
    "guest_remarks",
    "room_setup_notes",
    "dietary_notes",
    "accessibility_notes",
    "vip_flag",
    "vip_notes",
    "special_occasion",
    "immigration_registration_required",
    "voucher_number",
    "registration_card_signed",
    "generate_bill",
    "folio_number",
    "registration_number",
    "checked_in_at",
    "checked_out_at",
    "checked_in_by_staff_id",
    "digital_key_issued",
    "created_at",
    "group_booking_id",
    "pricing_snapshot",
    "remarks_by_phase",
    "guarantee_release_date",
  ],
  "hotel.reservation_guests": ["id", "reservation_id", "guest_id", "is_primary", "relationship"],
  "hotel.folio_transactions": [
    "id",
    "tenant_id",
    "reservation_id",
    "kind",
    "amount",
    "method",
    "status",
    "description",
    "department",
    "posted_by",
    "voided_at",
    "voided_by",
    "void_reason",
    "currency_code",
    "fx_rate",
    "original_amount",
    "original_currency",
    "split_leg",
    "related_reservation_id",
    "cash_float_session_id",
    "metadata",
    "reference",
    "created_at",
  ],
  "hotel.tenant_fb_settings": ["tenant_id", "kitchen_overdue_minutes", "updated_at"],
  "hotel.fb_outlets": ["id", "tenant_id", "code", "name", "outlet_type", "is_active", "created_at"],
  "hotel.fb_stations": ["id", "tenant_id", "code", "name", "sort_order", "is_active"],
  "hotel.fb_menu_categories": [
    "id",
    "tenant_id",
    "outlet_id",
    "name",
    "sort_order",
    "is_active",
    "prep_minutes",
    "created_at",
  ],
  "hotel.fb_menu_items": [
    "id",
    "tenant_id",
    "outlet_id",
    "category_id",
    "station_id",
    "name",
    "description",
    "price",
    "is_available",
    "eighty_sixed_at",
    "eighty_sixed_by",
    "sort_order",
    "created_at",
    "updated_at",
  ],
  "hotel.fb_tables": ["id", "tenant_id", "outlet_id", "table_code", "covers", "status", "created_at"],
  "hotel.fb_orders": [
    "id",
    "tenant_id",
    "outlet_id",
    "order_number",
    "table_id",
    "tab_label",
    "reservation_id",
    "status",
    "rush",
    "placed_by",
    "sent_to_kitchen_at",
    "ready_acknowledged_at",
    "kitchen_ready_at",
    "served_at",
    "closed_at",
    "voided_at",
    "void_reason",
    "settlement_method",
    "subtotal",
    "notes",
    "created_at",
    "updated_at",
  ],
  "hotel.fb_order_items": [
    "id",
    "tenant_id",
    "order_id",
    "menu_item_id",
    "name_snapshot",
    "price_snapshot",
    "quantity",
    "station_id",
    "station_code_snapshot",
    "kitchen_status",
    "notes",
    "created_at",
    "updated_at",
  ],
} as const;
