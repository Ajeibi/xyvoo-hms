export type FbOutletType = "restaurant" | "bar" | "room_service";
export type FbTableStatus = "available" | "seated" | "dirty";
export type FbOrderStatus = "open" | "sent_to_kitchen" | "ready" | "closed" | "voided";
export type FbOrderSettlementMethod = "cash" | "card" | "pos" | "room_charge";
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
  notes: string | null;
  created_at: string;
};

export type FbOrderWithItems = FbOrderRow & {
  items: FbOrderItemRow[];
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
  }[];
};
