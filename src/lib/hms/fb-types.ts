export type FbOutletType = "restaurant" | "bar" | "room_service";
export type FbTableStatus = "available" | "seated" | "dirty";
export type FbOrderStatus = "open" | "sent_to_kitchen" | "ready" | "closed" | "voided" | "merged";
/** "split" = paid in several parts with more than one method. */
export type FbOrderSettlementMethod = "cash" | "card" | "pos" | "room_charge" | "split";
export type FbKitchenStatus = "pending" | "preparing" | "ready" | "served" | "voided";

export type FbOutletRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  outlet_type: FbOutletType;
  is_active: boolean;
};

export type FbStationRow = {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
};

export type FbMenuCategoryRow = {
  id: string;
  tenant_id: string;
  outlet_id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  /** Per-category cook-time target in minutes. null = use the global kitchen threshold. */
  prep_minutes: number | null;
  /** Course this category's items start on (0 straight away … 3 desserts). null = the default. */
  default_course: number | null;
};

export type FbMenuItemRow = {
  id: string;
  tenant_id: string;
  outlet_id: string;
  category_id: string | null;
  station_id: string | null;
  name: string;
  description: string | null;
  price: number;
  is_available: boolean;
  eighty_sixed_at: string | null;
  sort_order: number;
};

export type FbTableRow = {
  id: string;
  tenant_id: string;
  outlet_id: string;
  table_code: string;
  covers: number;
  status: FbTableStatus;
};

export type FbOrderRow = {
  id: string;
  tenant_id: string;
  outlet_id: string;
  order_number: string;
  table_id: string | null;
  tab_label: string | null;
  reservation_id: string | null;
  status: FbOrderStatus;
  rush: boolean;
  placed_by: string | null;
  sent_to_kitchen_at: string | null;
  ready_acknowledged_at: string | null;
  kitchen_ready_at: string | null;
  served_at: string | null;
  closed_at: string | null;
  voided_at: string | null;
  settlement_method: FbOrderSettlementMethod | null;
  /** When the payment or room charge became final; the bill is frozen from then on. */
  settled_at: string | null;
  settled_by: string | null;
  amount_tendered: number | null;
  change_given: number | null;
  /** Sum of payments taken so far. Any payment freezes the bill. */
  paid_amount: number;
  /** Lines total; subtotal = this + service charge + taxes not already in the prices. */
  items_total: number;
  service_charge_amount: number;
  levy_amount: number;
  vat_amount: number;
  /** Rates copied from the hotel's settings when the bill was opened. */
  service_charge_percent: number;
  levy_percent: number;
  vat_percent: number;
  prices_include_tax: boolean;
  service_charge_waived_reason: string | null;
  /** The first bill of a split table; null on that first bill (and on unsplit orders). */
  split_from_order_id: string | null;
  /** 1 for the first bill, 2, 3… for bills split from it. */
  bill_number: number;
  /** Set when this bill was combined into another. */
  merged_into_order_id: string | null;
  subtotal: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type FbOrderItemRow = {
  id: string;
  tenant_id: string;
  order_id: string;
  menu_item_id: string | null;
  name_snapshot: string;
  price_snapshot: number;
  quantity: number;
  station_id: string | null;
  station_code_snapshot: string | null;
  kitchen_status: FbKitchenStatus;
  /** Free-text kitchen note for this line, e.g. "nut allergy". */
  notes: string | null;
  /** Choices made for this line (snapshots). price_snapshot already includes them. */
  modifiers: FbOrderItemModifier[];
  /** 0 straight away, 1 starters, 2 mains, 3 desserts. */
  course: number;
  /** When the line was released to the kitchen; null = held. */
  fired_at: string | null;
  /** Seat at the table (null = shared or not set). */
  seat: number | null;
  /** Set when the line was taken off the bill. */
  void_reason: string | null;
  voided_at: string | null;
  /** Set when the line was given free; original_price is what it would have cost. */
  comp_reason: string | null;
  comped_at: string | null;
  original_price: number | null;
  /** Menu price before a happy hour or other price rule; null when none applied. */
  list_price: number | null;
  /** The price rule used, e.g. "Happy hour". */
  price_rule_name: string | null;
  created_at: string;
};

export type FbOrderPayment = {
  id: string;
  method: "cash" | "card" | "pos" | "room_charge";
  amount: number;
  amount_tendered: number | null;
  change_given: number;
  share_label: string | null;
  /** Tip given with this payment, on top of amount (not part of the bill). */
  tip_amount: number;
  /** Who the tip is for; null = the shared pool. */
  tip_staff_id: string | null;
  created_at: string;
};

export type FbOrderItemModifier = {
  group_name: string;
  option_name: string;
  price_delta: number;
};

export type FbModifierOptionRow = {
  id: string;
  group_id: string;
  name: string;
  price_delta: number;
  sort_order: number;
  is_active: boolean;
};

/** A hotel-wide choice group (e.g. "Doneness"), linked to menu items. */
export type FbModifierGroupRow = {
  id: string;
  tenant_id: string;
  name: string;
  /** Fewest options a guest must pick (0 = optional). */
  min_select: number;
  /** Most options a guest may pick (null = no limit). */
  max_select: number | null;
  sort_order: number;
  is_active: boolean;
  options: FbModifierOptionRow[];
};

export type FbMenuItemModifierLink = {
  menu_item_id: string;
  group_id: string;
  sort_order: number;
};

export type FbOrderWithItems = FbOrderRow & {
  items: FbOrderItemRow[];
  /** Payments taken on this bill, oldest first. */
  payments?: FbOrderPayment[];
  table_code?: string | null;
  outlet_name?: string;
  outlet_type?: FbOutletType;
  /** Effective cook-time target (max of item categories' prep_minutes). null = use global. */
  category_overdue_minutes?: number | null;
};

export type FbKitchenTicket = {
  id: string;
  order_number: string;
  table_label: string;
  rush: boolean;
  created_at: string;
  sent_to_kitchen_at: string | null;
  status: FbOrderStatus;
  /** Effective cook-time target for this ticket. null = use global kitchen threshold. */
  overdue_minutes: number | null;
  items: {
    id: string;
    name: string;
    quantity: number;
    kitchen_status: FbKitchenStatus;
    station_code: string | null;
    menu_item_id: string | null;
    /** Choices to cook to, e.g. "Doneness: Well done". */
    modifiers: string[];
    notes: string | null;
    course: number;
    seat: number | null;
  }[];
  /** Courses on this order still held by front of house, for look-ahead. */
  held: { course: number; label: string; count: number }[];
};
