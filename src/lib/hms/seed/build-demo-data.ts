import {
  DEMO_CONFIRMATION_PREFIX,
  DEMO_FOLIO_PREFIX,
  DEMO_GUEST_ID_PREFIX,
  DEMO_GROUP_NAME,
  DEMO_IDS,
  DEMO_ORDER_PREFIX,
  DEMO_REGISTRATION_PREFIX,
} from "./demo-markers";
import { dateOnlyAgo, isoAgo, isoFromNow, isoTodayUtc, type DemoTenantContext } from "./demo-schema";

export type DemoSeedPayload = {
  guests: Record<string, unknown>[];
  groupBookings: Record<string, unknown>[];
  reservations: Record<string, unknown>[];
  reservationGuests: Record<string, unknown>[];
  folioTransactions: Record<string, unknown>[];
  tenantFbSettings: Record<string, unknown>;
  fbOutlets: Record<string, unknown>[];
  fbStations: Record<string, unknown>[];
  fbMenuCategories: Record<string, unknown>[];
  fbMenuItems: Record<string, unknown>[];
  fbTables: Record<string, unknown>[];
  fbOrders: Record<string, unknown>[];
  fbOrderItems: Record<string, unknown>[];
};

const GUEST_PROFILES = [
  { title: "Ms", first: "Adaeze", last: "Okoro", nationality: "NG", gender: "female", channel: "whatsapp" },
  { title: "Mr", first: "Bruno", last: "Silva", nationality: "BR", gender: "male", channel: "email" },
  { title: "Mrs", first: "Catherine", last: "Mensah", nationality: "GH", gender: "female", channel: "phone" },
  { title: "Dr", first: "Daniel", last: "Park", nationality: "KR", gender: "male", channel: "email" },
  { title: "Ms", first: "Esperanza", last: "Lopez", nationality: "ES", gender: "female", channel: "sms" },
  { title: "Mr", first: "Faisal", last: "Rahman", nationality: "BD", gender: "male", channel: "email" },
  { title: "Mrs", first: "Gifty", last: "Owusu", nationality: "GH", gender: "female", channel: "whatsapp" },
  { title: "Mr", first: "Henrik", last: "Larsson", nationality: "SE", gender: "male", channel: "phone" },
] as const;

function buildGuests(tenantId: string): Record<string, unknown>[] {
  return GUEST_PROFILES.map((g, i) => {
    const n = String(i + 1).padStart(5, "0");
    const id = DEMO_IDS.guests[i];
    return {
      id,
      tenant_id: tenantId,
      title: g.title,
      first_name: g.first,
      last_name: g.last,
      nationality: g.nationality,
      id_type: i % 3 === 0 ? "national_id" : "passport",
      id_number: `${DEMO_GUEST_ID_PREFIX}${n}`,
      id_expiry_date: dateOnlyAgo(-365 * (3 + (i % 4))),
      date_of_birth: dateOnlyAgo(365 * (28 + i)),
      gender: g.gender,
      id_document_storage_path: `demo/guests/${id}/id-scan.pdf`,
      phone: `+234901${String(1000000 + i).slice(-7)}`,
      email: `${g.first.toLowerCase()}.${g.last.toLowerCase()}@demo.xyvoo.example`,
      whatsapp: g.channel === "whatsapp" ? `+234901${String(2000000 + i).slice(-7)}` : null,
      preferred_channel: g.channel,
      tags: ["demo", i % 2 === 0 ? "vip" : "repeat"],
      created_at: isoAgo(60 * 24 * (30 + i)),
    };
  });
}

function buildGroupBooking(tenantId: string): Record<string, unknown> {
  return {
    id: DEMO_IDS.groupBooking,
    tenant_id: tenantId,
    group_name: DEMO_GROUP_NAME,
    coordinator_name: "Peace Agada",
    coordinator_phone: "+2348012345678",
    room_count: 3,
    shared_billing: true,
    bill_to_account: "DEMO-CORP-ACCT-001",
    arrival_at: isoAgo(60 * 24 * 2),
    departure_at: isoFromNow(60 * 24 * 3),
    notes: "Demo group block — sample data for sales tours.",
    created_at: isoAgo(60 * 24 * 14),
  };
}

function buildReservations(ctx: DemoTenantContext): Record<string, unknown>[] {
  const { tenantId, roomTypeCode, roomUnitId } = ctx;

  const base = {
    tenant_id: tenantId,
    room_type_code: roomTypeCode,
    rate_type: "rack",
    season_code: "peak",
    rate_per_night: 65000,
    total_room_charges: 195000,
    rate_overridden: false,
    rate_override_reason: null,
    show_rate_on_registration_card: true,
    vat_applicable: true,
    tax_exempt: false,
    tax_exemption_reason: null,
    tax_exemption_doc_ref: null,
    bill_to_account: null,
    po_number: null,
    folio_split_notes: null,
    min_payment_per_day: null,
    booking_channel: "direct",
    travel_agent_name: null,
    commission_plan: null,
    commission_value: null,
    room_preferences_text: null,
    room_setup_notes: null,
    dietary_notes: null,
    accessibility_notes: null,
    vip_flag: false,
    vip_notes: null,
    special_occasion: null,
    immigration_registration_required: false,
    voucher_number: null,
    registration_card_signed: true,
    generate_bill: true,
    checked_in_by_staff_id: null,
    group_booking_id: null,
    guarantee_release_date: null,
    pricing_snapshot: {},
    remarks_by_phase: {},
  };

  return [
    {
      ...base,
      id: DEMO_IDS.reservations[0],
      confirmation_code: `${DEMO_CONFIRMATION_PREFIX}00001`,
      status: "checked_in",
      arrival_at: isoAgo(60 * 26),
      departure_at: isoFromNow(60 * 24 * 2),
      nights: 3,
      adults: 2,
      children_json: [{ age: 8 }],
      purpose_of_visit: "leisure",
      room_unit_id: roomUnitId,
      room_preferences_text: "High floor, away from lift",
      settlement_method: "card",
      preauth_amount: 150000,
      market_segment: "transient",
      source: "website",
      guest_remarks: "Anniversary stay — demo guest.",
      folio_number: `${DEMO_FOLIO_PREFIX}00001`,
      registration_number: `${DEMO_REGISTRATION_PREFIX}00001`,
      checked_in_at: isoAgo(60 * 25),
      checked_out_at: null,
      digital_key_issued: true,
      created_at: isoAgo(60 * 24 * 5),
      pricing_snapshot: {
        currency: ctx.currency,
        vatRate: 0.075,
        levies: { tourism: 0.02 },
        lines: [{ code: "room", amount: 195000 }],
      },
      remarks_by_phase: {
        reservation: "Requested late check-in",
        check_in: "Welcome drink offered",
        check_out: "",
      },
      guarantee_release_date: dateOnlyAgo(-7),
    },
    {
      ...base,
      id: DEMO_IDS.reservations[1],
      confirmation_code: `${DEMO_CONFIRMATION_PREFIX}00002`,
      status: "confirmed",
      arrival_at: isoFromNow(60 * 6),
      departure_at: isoFromNow(60 * 24 * 2 + 60 * 10),
      nights: 2,
      adults: 1,
      children_json: [],
      purpose_of_visit: "business",
      room_unit_id: null,
      room_preferences_text: "Quiet room",
      settlement_method: "direct_bill",
      preauth_amount: null,
      market_segment: "corporate",
      source: "phone",
      guest_remarks: "Corporate rate — demo",
      bill_to_account: "DEMO-CORP-ACCT-001",
      folio_number: `${DEMO_FOLIO_PREFIX}00002`,
      registration_number: `${DEMO_REGISTRATION_PREFIX}00002`,
      checked_in_at: null,
      checked_out_at: null,
      digital_key_issued: false,
      created_at: isoAgo(60 * 24 * 2),
      group_booking_id: DEMO_IDS.groupBooking,
    },
    {
      ...base,
      id: DEMO_IDS.reservations[2],
      confirmation_code: `${DEMO_CONFIRMATION_PREFIX}00003`,
      status: "checked_out",
      arrival_at: isoAgo(60 * 24 * 4),
      departure_at: isoAgo(60 * 20),
      nights: 4,
      adults: 2,
      children_json: [],
      purpose_of_visit: "leisure",
      room_unit_id: roomUnitId,
      rate_type: "promotional",
      rate_per_night: 48000,
      total_room_charges: 192000,
      settlement_method: "pos",
      preauth_amount: 50000,
      market_segment: "transient",
      source: "ota",
      travel_agent_name: "Demo Travel Co",
      commission_plan: "percent",
      commission_value: 10,
      guest_remarks: "OTA booking — demo",
      folio_number: `${DEMO_FOLIO_PREFIX}00003`,
      registration_number: `${DEMO_REGISTRATION_PREFIX}00003`,
      checked_in_at: isoAgo(60 * 24 * 4),
      checked_out_at: isoAgo(60 * 18),
      digital_key_issued: true,
      created_at: isoAgo(60 * 24 * 10),
    },
    {
      ...base,
      id: DEMO_IDS.reservations[3],
      confirmation_code: `${DEMO_CONFIRMATION_PREFIX}00004`,
      status: "cancelled",
      arrival_at: isoFromNow(60 * 24),
      departure_at: isoFromNow(60 * 24 * 3),
      nights: 2,
      adults: 1,
      children_json: [],
      purpose_of_visit: "transit",
      room_unit_id: null,
      room_preferences_text: null,
      settlement_method: "cash",
      preauth_amount: null,
      market_segment: "government",
      source: "walk_in",
      guest_remarks: "Cancelled — demo",
      folio_number: `${DEMO_FOLIO_PREFIX}00004`,
      registration_number: `${DEMO_REGISTRATION_PREFIX}00004`,
      checked_in_at: null,
      checked_out_at: null,
      digital_key_issued: false,
      created_at: isoAgo(60 * 24 * 7),
    },
    {
      ...base,
      id: DEMO_IDS.reservations[4],
      confirmation_code: `${DEMO_CONFIRMATION_PREFIX}00005`,
      status: "no_show",
      arrival_at: isoAgo(60 * 12),
      departure_at: isoAgo(60 * 6),
      nights: 1,
      adults: 2,
      children_json: [{ age: 12 }],
      purpose_of_visit: "leisure",
      room_unit_id: null,
      room_preferences_text: "Corner suite if available",
      rate_overridden: true,
      rate_override_reason: "Manager courtesy rate — demo",
      settlement_method: "partial_credit",
      preauth_amount: 25000,
      market_segment: "wholesale",
      source: "travel_agent",
      travel_agent_name: "Wholesale Demo Ltd",
      commission_plan: "flat",
      commission_value: 5000,
      vip_flag: true,
      vip_notes: "Demo VIP flag",
      special_occasion: "Birthday",
      guest_remarks: "No-show demo record",
      folio_number: `${DEMO_FOLIO_PREFIX}00005`,
      registration_number: `${DEMO_REGISTRATION_PREFIX}00005`,
      checked_in_at: null,
      checked_out_at: null,
      digital_key_issued: false,
      created_at: isoAgo(60 * 24 * 3),
      pricing_snapshot: { currency: ctx.currency, note: "no-show demo" },
      remarks_by_phase: { reservation: "VIP birthday package" },
    },
  ];
}

function buildReservationGuests(): Record<string, unknown>[] {
  return [
    {
      id: "d00000d1-0000-4000-8000-000000000001",
      reservation_id: DEMO_IDS.reservations[0],
      guest_id: DEMO_IDS.guests[0],
      is_primary: true,
      relationship: null,
    },
    {
      id: "d00000d1-0000-4000-8000-000000000002",
      reservation_id: DEMO_IDS.reservations[0],
      guest_id: DEMO_IDS.guests[1],
      is_primary: false,
      relationship: "spouse",
    },
    {
      id: "d00000d1-0000-4000-8000-000000000003",
      reservation_id: DEMO_IDS.reservations[1],
      guest_id: DEMO_IDS.guests[2],
      is_primary: true,
      relationship: null,
    },
    {
      id: "d00000d1-0000-4000-8000-000000000004",
      reservation_id: DEMO_IDS.reservations[2],
      guest_id: DEMO_IDS.guests[3],
      is_primary: true,
      relationship: null,
    },
    {
      id: "d00000d1-0000-4000-8000-000000000005",
      reservation_id: DEMO_IDS.reservations[4],
      guest_id: DEMO_IDS.guests[4],
      is_primary: true,
      relationship: null,
    },
  ];
}

function buildFolioTransactions(tenantId: string): Record<string, unknown>[] {
  return [
    {
      id: "e00000d1-0000-4000-8000-000000000001",
      tenant_id: tenantId,
      reservation_id: DEMO_IDS.reservations[0],
      kind: "charge",
      amount: 195000,
      method: "system",
      status: "posted",
      description: "Room charges — demo",
      department: "rooms",
      posted_by: null,
      voided_at: null,
      voided_by: null,
      void_reason: null,
      currency_code: "NGN",
      fx_rate: null,
      original_amount: null,
      original_currency: null,
      split_leg: "guest",
      related_reservation_id: null,
      cash_float_session_id: null,
      metadata: { demo: true, source: "seed" },
      reference: "DEMO-CHG-001",
      created_at: isoAgo(60 * 24),
    },
    {
      id: "e00000d1-0000-4000-8000-000000000002",
      tenant_id: tenantId,
      reservation_id: DEMO_IDS.reservations[0],
      kind: "payment",
      amount: -100000,
      method: "card",
      status: "posted",
      description: "Card preauth capture — demo",
      department: "front_desk",
      posted_by: null,
      voided_at: null,
      voided_by: null,
      void_reason: null,
      currency_code: "NGN",
      fx_rate: null,
      original_amount: null,
      original_currency: null,
      split_leg: "guest",
      related_reservation_id: DEMO_IDS.reservations[0],
      cash_float_session_id: null,
      metadata: { demo: true },
      reference: "DEMO-PAY-001",
      created_at: isoAgo(60 * 20),
    },
    {
      id: "e00000d1-0000-4000-8000-000000000003",
      tenant_id: tenantId,
      reservation_id: DEMO_IDS.reservations[2],
      kind: "charge",
      amount: 192000,
      method: "system",
      status: "posted",
      description: "Checked-out stay — demo",
      department: "rooms",
      posted_by: null,
      voided_at: null,
      voided_by: null,
      void_reason: null,
      currency_code: "NGN",
      fx_rate: 1,
      original_amount: 192000,
      original_currency: "NGN",
      split_leg: "guest",
      related_reservation_id: null,
      cash_float_session_id: null,
      metadata: { demo: true },
      reference: "DEMO-CHG-002",
      created_at: isoAgo(60 * 24 * 5),
    },
  ];
}

function buildRoomChargeFolioFromOrders(
  tenantId: string,
  orders: Record<string, unknown>[],
): Record<string, unknown>[] {
  const lines: Record<string, unknown>[] = [];
  let seq = 10;

  for (const order of orders) {
    if (order.status !== "closed") continue;
    if (order.settlement_method !== "room_charge") continue;
    if (!order.reservation_id || !order.closed_at) continue;

    const orderNumber = String(order.order_number);
    const suffix = orderNumber.replace(DEMO_ORDER_PREFIX, "");
    seq += 1;

    lines.push({
      id: `e00000d1-0000-4000-8000-${String(seq).padStart(12, "0")}`,
      tenant_id: tenantId,
      reservation_id: order.reservation_id,
      kind: "charge",
      amount: order.subtotal,
      method: "system",
      status: "posted",
      description: `F&B order ${orderNumber}`,
      department: "food_beverage",
      posted_by: null,
      voided_at: null,
      voided_by: null,
      void_reason: null,
      currency_code: "NGN",
      fx_rate: null,
      original_amount: null,
      original_currency: null,
      split_leg: "guest",
      related_reservation_id: null,
      cash_float_session_id: null,
      metadata: { demo: true, source: "seed", fb_order: order.id },
      reference: `DEMO-FB-CHG-${suffix}`,
      created_at: order.closed_at,
    });
  }

  return lines;
}

function buildFbConfig(tenantId: string) {
  const restaurantId = DEMO_IDS.outletRestaurant;
  const barId = DEMO_IDS.outletBar;

  const outlets: Record<string, unknown>[] = [
    {
      id: restaurantId,
      tenant_id: tenantId,
      code: "demo_restaurant",
      name: "Demo Restaurant",
      outlet_type: "restaurant",
      is_active: true,
      created_at: isoAgo(60 * 24 * 60),
    },
    {
      id: barId,
      tenant_id: tenantId,
      code: "demo_bar",
      name: "Demo Bar",
      outlet_type: "bar",
      is_active: true,
      created_at: isoAgo(60 * 24 * 60),
    },
  ];

  const stations: Record<string, unknown>[] = [
    {
      id: DEMO_IDS.stationGrill,
      tenant_id: tenantId,
      code: "grill",
      name: "Grill",
      sort_order: 0,
      is_active: true,
    },
    {
      id: DEMO_IDS.stationCold,
      tenant_id: tenantId,
      code: "cold",
      name: "Cold prep",
      sort_order: 1,
      is_active: true,
    },
    {
      id: DEMO_IDS.stationBar,
      tenant_id: tenantId,
      code: "bar",
      name: "Bar",
      sort_order: 2,
      is_active: true,
    },
  ];

  const categories: Record<string, unknown>[] = [
    {
      id: DEMO_IDS.categories.starters,
      tenant_id: tenantId,
      outlet_id: restaurantId,
      name: "Starters",
      sort_order: 0,
      is_active: true,
      prep_minutes: 8,
      created_at: isoAgo(60 * 24 * 30),
    },
    {
      id: DEMO_IDS.categories.mains,
      tenant_id: tenantId,
      outlet_id: restaurantId,
      name: "Mains",
      sort_order: 1,
      is_active: true,
      prep_minutes: 22,
      created_at: isoAgo(60 * 24 * 30),
    },
    {
      id: DEMO_IDS.categories.desserts,
      tenant_id: tenantId,
      outlet_id: restaurantId,
      name: "Desserts",
      sort_order: 2,
      is_active: true,
      prep_minutes: 12,
      created_at: isoAgo(60 * 24 * 30),
    },
    {
      id: DEMO_IDS.categories.bar,
      tenant_id: tenantId,
      outlet_id: barId,
      name: "Cocktails",
      sort_order: 0,
      is_active: true,
      prep_minutes: 5,
      created_at: isoAgo(60 * 24 * 30),
    },
  ];

  const itemDefs: {
    id: string;
    cat: string;
    station: string;
    name: string;
    price: number;
    sort: number;
    eightySix?: boolean;
    outlet?: string;
  }[] = [
    { id: "f00000d1-0000-4000-8000-000000000041", cat: DEMO_IDS.categories.starters, station: DEMO_IDS.stationCold, name: "Garden salad", price: 3500, sort: 0 },
    { id: "f00000d1-0000-4000-8000-000000000042", cat: DEMO_IDS.categories.starters, station: DEMO_IDS.stationGrill, name: "Grilled prawns", price: 8500, sort: 1 },
    { id: "f00000d1-0000-4000-8000-000000000043", cat: DEMO_IDS.categories.mains, station: DEMO_IDS.stationGrill, name: "Jollof & chicken", price: 6500, sort: 0 },
    { id: "f00000d1-0000-4000-8000-000000000044", cat: DEMO_IDS.categories.mains, station: DEMO_IDS.stationGrill, name: "Grilled steak", price: 15000, sort: 1 },
    { id: "f00000d1-0000-4000-8000-000000000045", cat: DEMO_IDS.categories.mains, station: DEMO_IDS.stationGrill, name: "Seafood platter", price: 22000, sort: 2, eightySix: true },
    { id: "f00000d1-0000-4000-8000-000000000046", cat: DEMO_IDS.categories.desserts, station: DEMO_IDS.stationCold, name: "Chocolate fondant", price: 4500, sort: 0 },
    { id: "f00000d1-0000-4000-8000-000000000047", cat: DEMO_IDS.categories.bar, station: DEMO_IDS.stationBar, name: "Mojito", price: 5000, sort: 0, outlet: barId },
    { id: "f00000d1-0000-4000-8000-000000000048", cat: DEMO_IDS.categories.bar, station: DEMO_IDS.stationBar, name: "Local beer", price: 2500, sort: 1, outlet: barId },
  ];

  const menuItems: Record<string, unknown>[] = itemDefs.map((d) => ({
    id: d.id,
    tenant_id: tenantId,
    outlet_id: d.outlet ?? restaurantId,
    category_id: d.cat,
    station_id: d.station,
    name: d.name,
    description: `${d.name} — demo menu item`,
    price: d.price,
    is_available: !d.eightySix,
    eighty_sixed_at: d.eightySix ? isoAgo(60 * 2) : null,
    eighty_sixed_by: null,
    sort_order: d.sort,
    created_at: isoAgo(60 * 24 * 20),
    updated_at: isoAgo(60 * 2),
  }));

  const tables: Record<string, unknown>[] = DEMO_IDS.tables.map((id, i) => ({
    id,
    tenant_id: tenantId,
    outlet_id: restaurantId,
    table_code: `T${i + 1}`,
    covers: 2 + (i % 4),
    status: i === 1 ? "seated" : i === 4 ? "dirty" : "available",
    created_at: isoAgo(60 * 24 * 20),
  }));

  return { outlets, stations, categories, menuItems, tables, restaurantId, barId };
}

type OrderSpec = {
  id: string;
  num: string;
  status: "closed" | "ready" | "voided" | "sent_to_kitchen" | "open";
  tableId?: string;
  tabLabel?: string;
  outletId: string;
  reservationId?: string;
  rush?: boolean;
  sentAt?: string | null;
  kitchenReadyAt?: string | null;
  servedAt?: string | null;
  readyAckAt?: string | null;
  closedAt?: string | null;
  voidedAt?: string | null;
  voidReason?: string;
  /** F&B only settles via PoS counter or room charge — match live product flows. */
  settlement?: "pos" | "room_charge" | null;
  notes?: string;
  subtotal: number;
  items: {
    menuId: string;
    name: string;
    price: number;
    qty: number;
    status: string;
    station: string;
    notes?: string;
  }[];
};

function buildFbOrders(
  tenantId: string,
  restaurantId: string,
  barId: string,
  reservationId: string,
): { orders: Record<string, unknown>[]; items: Record<string, unknown>[] } {
  const specs: OrderSpec[] = [
    {
      id: "f00000d1-0000-4000-8000-000000000051",
      num: "00001",
      status: "closed",
      tableId: DEMO_IDS.tables[0],
      outletId: restaurantId,
      reservationId,
      sentAt: isoAgo(180),
      kitchenReadyAt: isoAgo(155),
      servedAt: isoAgo(148),
      readyAckAt: isoAgo(147),
      closedAt: isoAgo(140),
      settlement: "pos",
      subtotal: 15000,
      items: [
        { menuId: "f00000d1-0000-4000-8000-000000000044", name: "Grilled steak", price: 15000, qty: 1, status: "served", station: "grill" },
      ],
    },
    {
      id: "f00000d1-0000-4000-8000-000000000052",
      num: "00002",
      status: "closed",
      tableId: DEMO_IDS.tables[2],
      outletId: restaurantId,
      sentAt: isoAgo(300),
      kitchenReadyAt: isoAgo(240),
      servedAt: isoAgo(200),
      closedAt: isoAgo(190),
      settlement: "pos",
      subtotal: 10000,
      items: [
        { menuId: "f00000d1-0000-4000-8000-000000000043", name: "Jollof & chicken", price: 6500, qty: 1, status: "served", station: "grill" },
        { menuId: "f00000d1-0000-4000-8000-000000000041", name: "Garden salad", price: 3500, qty: 1, status: "served", station: "cold" },
      ],
    },
    {
      id: "f00000d1-0000-4000-8000-000000000053",
      num: "00003",
      status: "closed",
      tableId: DEMO_IDS.tables[3],
      outletId: restaurantId,
      sentAt: isoAgo(90),
      kitchenReadyAt: isoAgo(35),
      servedAt: isoAgo(28),
      closedAt: isoAgo(20),
      settlement: "room_charge",
      reservationId,
      subtotal: 22000,
      notes: "Charged to room — demo",
      items: [
        { menuId: "f00000d1-0000-4000-8000-000000000042", name: "Grilled prawns", price: 8500, qty: 1, status: "served", station: "grill" },
        { menuId: "f00000d1-0000-4000-8000-000000000046", name: "Chocolate fondant", price: 4500, qty: 1, status: "served", station: "cold" },
        { menuId: "f00000d1-0000-4000-8000-000000000043", name: "Jollof & chicken", price: 6500, qty: 1, status: "served", station: "grill", notes: "Extra spicy" },
      ],
    },
    {
      id: "f00000d1-0000-4000-8000-000000000054",
      num: "00004",
      status: "ready",
      tableId: DEMO_IDS.tables[1],
      outletId: restaurantId,
      rush: true,
      sentAt: isoAgo(45),
      kitchenReadyAt: isoAgo(12),
      subtotal: 6500,
      notes: "Awaiting payment — demo",
      items: [
        { menuId: "f00000d1-0000-4000-8000-000000000043", name: "Jollof & chicken", price: 6500, qty: 1, status: "ready", station: "grill" },
      ],
    },
    {
      id: "f00000d1-0000-4000-8000-000000000055",
      num: "00005",
      status: "ready",
      tableId: DEMO_IDS.tables[4],
      outletId: restaurantId,
      sentAt: isoAgo(70),
      kitchenReadyAt: isoAgo(25),
      servedAt: isoAgo(18),
      readyAckAt: isoAgo(17),
      subtotal: 15000,
      items: [
        { menuId: "f00000d1-0000-4000-8000-000000000044", name: "Grilled steak", price: 15000, qty: 1, status: "served", station: "grill" },
      ],
    },
    {
      id: "f00000d1-0000-4000-8000-000000000056",
      num: "00006",
      status: "voided",
      tableId: DEMO_IDS.tables[5],
      outletId: restaurantId,
      sentAt: isoAgo(120),
      voidedAt: isoAgo(110),
      voidReason: "Guest changed mind — demo",
      subtotal: 8500,
      items: [
        { menuId: "f00000d1-0000-4000-8000-000000000042", name: "Grilled prawns", price: 8500, qty: 1, status: "voided", station: "grill" },
      ],
    },
    {
      id: "f00000d1-0000-4000-8000-000000000057",
      num: "00007",
      status: "sent_to_kitchen",
      tableId: DEMO_IDS.tables[0],
      outletId: restaurantId,
      sentAt: isoAgo(18),
      subtotal: 18500,
      items: [
        { menuId: "f00000d1-0000-4000-8000-000000000044", name: "Grilled steak", price: 15000, qty: 1, status: "preparing", station: "grill" },
        { menuId: "f00000d1-0000-4000-8000-000000000041", name: "Garden salad", price: 3500, qty: 1, status: "pending", station: "cold" },
      ],
    },
    {
      id: "f00000d1-0000-4000-8000-000000000058",
      num: "00008",
      status: "sent_to_kitchen",
      outletId: restaurantId,
      tabLabel: "Pool deck",
      rush: true,
      sentAt: isoAgo(8),
      subtotal: 6500,
      items: [
        { menuId: "f00000d1-0000-4000-8000-000000000043", name: "Jollof & chicken", price: 6500, qty: 1, status: "pending", station: "grill" },
      ],
    },
    {
      id: "f00000d1-0000-4000-8000-000000000059",
      num: "00009",
      status: "closed",
      outletId: barId,
      tabLabel: "Lobby bar",
      sentAt: isoAgo(50),
      kitchenReadyAt: isoAgo(48),
      servedAt: isoAgo(45),
      closedAt: isoAgo(44),
      settlement: "pos",
      subtotal: 7500,
      items: [
        { menuId: "f00000d1-0000-4000-8000-000000000047", name: "Mojito", price: 5000, qty: 1, status: "served", station: "bar" },
        { menuId: "f00000d1-0000-4000-8000-000000000048", name: "Local beer", price: 2500, qty: 1, status: "served", station: "bar" },
      ],
    },
    {
      id: "f00000d1-0000-4000-8000-00000000005a",
      num: "00010",
      status: "closed",
      tableId: DEMO_IDS.tables[2],
      outletId: restaurantId,
      sentAt: isoAgo(600),
      kitchenReadyAt: isoAgo(520),
      servedAt: isoAgo(500),
      closedAt: isoAgo(490),
      settlement: "pos",
      subtotal: 15000,
      items: [
        { menuId: "f00000d1-0000-4000-8000-000000000044", name: "Grilled steak", price: 15000, qty: 1, status: "served", station: "grill" },
      ],
    },
    {
      id: "f00000d1-0000-4000-8000-00000000005b",
      num: "00011",
      status: "closed",
      tableId: DEMO_IDS.tables[3],
      outletId: restaurantId,
      sentAt: isoAgo(2000),
      kitchenReadyAt: isoAgo(1940),
      servedAt: isoAgo(1920),
      closedAt: isoTodayUtc(11, 30),
      settlement: "room_charge",
      reservationId,
      subtotal: 4500,
      items: [
        { menuId: "f00000d1-0000-4000-8000-000000000046", name: "Chocolate fondant", price: 4500, qty: 1, status: "served", station: "cold" },
      ],
    },
    {
      id: "f00000d1-0000-4000-8000-00000000005c",
      num: "00012",
      status: "open",
      outletId: restaurantId,
      tabLabel: "Walk-in counter",
      subtotal: 3500,
      items: [
        { menuId: "f00000d1-0000-4000-8000-000000000041", name: "Garden salad", price: 3500, qty: 1, status: "pending", station: "cold" },
      ],
    },
  ];

  const orders: Record<string, unknown>[] = [];
  const items: Record<string, unknown>[] = [];

  for (const spec of specs) {
    const created = spec.sentAt ?? isoAgo(5);
    orders.push({
      id: spec.id,
      tenant_id: tenantId,
      outlet_id: spec.outletId,
      order_number: `${DEMO_ORDER_PREFIX}${spec.num}`,
      table_id: spec.tableId ?? null,
      tab_label: spec.tabLabel ?? null,
      reservation_id: spec.reservationId ?? null,
      status: spec.status,
      rush: Boolean(spec.rush),
      placed_by: null,
      sent_to_kitchen_at: spec.sentAt ?? null,
      ready_acknowledged_at: spec.readyAckAt ?? null,
      kitchen_ready_at: spec.kitchenReadyAt ?? null,
      served_at: spec.servedAt ?? null,
      closed_at: spec.closedAt ?? null,
      voided_at: spec.voidedAt ?? null,
      void_reason: spec.voidReason ?? null,
      settlement_method: spec.settlement ?? null,
      subtotal: spec.subtotal,
      notes: spec.notes ?? null,
      created_at: created,
      updated_at: spec.closedAt ?? spec.voidedAt ?? spec.servedAt ?? spec.kitchenReadyAt ?? created,
    });

    spec.items.forEach((it, idx) => {
      const itemSeq = parseInt(spec.num, 10) * 100 + idx;
      const itemId = `f00000d1-0000-4000-8000-${String(itemSeq).padStart(12, "0")}`;
      items.push({
        id: itemId,
        tenant_id: tenantId,
        order_id: spec.id,
        menu_item_id: it.menuId,
        name_snapshot: it.name,
        price_snapshot: it.price,
        quantity: it.qty,
        station_id:
          it.station === "grill"
            ? DEMO_IDS.stationGrill
            : it.station === "cold"
              ? DEMO_IDS.stationCold
              : DEMO_IDS.stationBar,
        station_code_snapshot: it.station,
        kitchen_status: it.status,
        notes: it.notes ?? null,
        created_at: created,
        updated_at: spec.closedAt ?? spec.servedAt ?? created,
      });
    });
  }

  return { orders, items };
}

export function buildDemoSeedPayload(ctx: DemoTenantContext): DemoSeedPayload {
  const { tenantId } = ctx;
  const fb = buildFbConfig(tenantId);
  const { orders, items } = buildFbOrders(
    tenantId,
    fb.restaurantId,
    fb.barId,
    DEMO_IDS.reservations[0],
  );

  return {
    guests: buildGuests(tenantId),
    groupBookings: [buildGroupBooking(tenantId)],
    reservations: buildReservations(ctx),
    reservationGuests: buildReservationGuests(),
    folioTransactions: [
      ...buildFolioTransactions(tenantId),
      ...buildRoomChargeFolioFromOrders(tenantId, orders),
    ],
    tenantFbSettings: {
      tenant_id: tenantId,
      kitchen_overdue_minutes: 15,
      updated_at: new Date().toISOString(),
    },
    fbOutlets: fb.outlets,
    fbStations: fb.stations,
    fbMenuCategories: fb.categories,
    fbMenuItems: fb.menuItems,
    fbTables: fb.tables,
    fbOrders: orders,
    fbOrderItems: items,
  };
}
