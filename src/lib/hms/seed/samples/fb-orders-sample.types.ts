/**
 * Human-friendly F&B order fixture format for bulk order-history seeding.
 * See fb-orders.sample.json for examples.
 *
 * Outlets: menu_1 (bar) | menu_2 (restaurant) — matches Pope seed outlet codes.
 * Settlement (closed orders): pos | room_charge | cash | card
 *   — use room_charge + reservation link for in-house guest folio posting.
 *
 * Dates: ISO timestamps or relative expressions (now-4h, today+13h, etc.)
 */

export type FbOrdersSampleFile = {
  _meta?: {
    description?: string;
    tenant_slug?: string;
    version?: number;
  };
  orders: FbOrderSample[];
};

export type FbOrderSample = {
  /** Your label — not stored in DB; used for cross-referencing when generating bulk data. */
  ref: string;

  /** menu_1 = bar (Menu 1), menu_2 = restaurant (Menu 2) */
  outlet: "menu_1" | "menu_2";

  /** open | sent_to_kitchen | ready | closed | voided */
  status: string;

  /**
   * Required when status is closed.
   * Most history rows should be pos; in-house dining → room_charge.
   */
  settlement_method?: "pos" | "room_charge" | "cash" | "card" | null;

  /** Restaurant table T1–T8. Omit for bar walk-in / tab orders. */
  table_code?: string | null;

  /** Bar walk-in label, e.g. "Lobby", "Pool side". Omit when table_code is set. */
  tab_label?: string | null;

  /**
   * Link to guest stay for room_charge orders.
   * Use stay ref from guest-stays JSON (e.g. STAY-101) OR confirmation_code (PJP-260711).
   */
  reservation_ref?: string | null;
  confirmation_code?: string | null;

  rush?: boolean;
  notes?: string | null;

  /** When the ticket was opened. Defaults to sent_to_kitchen_at or now. */
  placed_at?: string;

  sent_to_kitchen_at?: string | null;
  kitchen_ready_at?: string | null;
  served_at?: string | null;
  ready_acknowledged_at?: string | null;
  closed_at?: string | null;
  voided_at?: string | null;
  void_reason?: string | null;

  /**
   * Line items — menu_item name must match Pope menu (loader resolves to menu_item_id).
   * subtotal is optional; calculated from items if omitted.
   */
  items: FbOrderItemSample[];

  /** Override auto sum of item lines. */
  subtotal?: number;
};

export type FbOrderItemSample = {
  /** Exact name from Menu 1 / Menu 2 catalog, e.g. "Jollof Rice", "Guinness Extra Smooth" */
  menu_item: string;
  quantity: number;
  /** Optional unit price override; defaults to catalog price. */
  price?: number;
  /** pending | preparing | ready | served | voided */
  kitchen_status?: string;
  notes?: string | null;
};
