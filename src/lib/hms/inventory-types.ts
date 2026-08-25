/**
 * Store location type is now a tenant-managed lookup row (hotel.inventory_location_types),
 * not a fixed enum. This alias holds either that row's id (on an editable
 * record like InventoryLocationRow) or its resolved display name (on a
 * read-only reporting/detail type) — see each field's own comment.
 */
export type InventoryLocationType = string;

/** Unit of measure is a tenant-managed lookup row (hotel.inventory_units) — see InventoryLocationType above. */
export type InventoryUnitOfMeasure = string;

/** Item type is a tenant-managed lookup row (hotel.inventory_item_types) — see InventoryLocationType above. */
export type InventoryItemType = string;

export type InventoryUnitRow = {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type InventoryItemTypeRow = {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  sort_order: number;
  is_active: boolean;
  /** Excluded from the stock ledger entirely — belongs on a separate asset register, not inventory. */
  is_fixed_asset: boolean;
  /** Tracked as durable goods — breakage/loss language instead of spoilage language. */
  is_equipment: boolean;
  created_at: string;
};

export type InventorySupplierRow = {
  id: string;
  tenant_id: string;
  name: string;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
};

export type InventoryLocationTypeRow = {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type InventoryMovementType =
  | "receipt"
  | "issue"
  | "transfer_out"
  | "transfer_in"
  | "adjustment"
  | "waste"
  | "count_variance";

export type InventoryRequisitionStatus =
  | "pending"
  | "approved"
  | "partially_issued"
  | "issued"
  | "rejected"
  | "cancelled";

export type InventoryTransferStatus = "pending" | "in_transit" | "completed" | "cancelled";

export type InventoryStockCountStatus = "draft" | "in_progress" | "completed" | "posted";

export type InventoryLocationRow = {
  id: string;
  tenant_id: string;
  name: string;
  /** hotel.inventory_location_types.id */
  location_type: InventoryLocationType;
  location_type_name: string;
  is_active: boolean;
  created_at: string;
};

export type InventoryCategoryRow = {
  id: string;
  tenant_id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
  created_at: string;
};

export type InventoryItemRow = {
  id: string;
  tenant_id: string;
  sku: string;
  name: string;
  category_id: string | null;
  /** hotel.inventory_units.id — the unit stock is tracked/issued in. */
  unit_of_measure: InventoryUnitOfMeasure;
  unit_of_measure_name: string;
  /** hotel.inventory_units.id — the unit this item is bought in, if different from the issue unit (e.g. a case vs. a piece). */
  purchase_unit_id: string | null;
  purchase_unit_name: string | null;
  /** How many issue units make up one purchase unit. 1 when purchase and issue units are the same. */
  purchase_to_issue_factor: number;
  /** hotel.inventory_item_types.id */
  item_type: InventoryItemType;
  item_type_name: string;
  item_type_is_fixed_asset: boolean;
  item_type_is_equipment: boolean;
  unit_cost: number;
  barcode: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type InventoryStockLevelRow = {
  id: string;
  tenant_id: string;
  item_id: string;
  location_id: string;
  qty_on_hand: number;
  par_level: number;
  reorder_point: number;
  reorder_qty: number;
  updated_at: string;
};

export type InventoryStockLevelWithDetails = InventoryStockLevelRow & {
  item_name: string;
  item_sku: string;
  unit_of_measure: InventoryUnitOfMeasure;
  unit_cost: number;
  location_name: string;
};

export type InventoryStockMovementRow = {
  id: string;
  tenant_id: string;
  item_id: string;
  location_id: string;
  movement_type: InventoryMovementType;
  qty: number;
  unit_cost_at_movement: number;
  related_location_id: string | null;
  reference_type: string | null;
  reference_id: string | null;
  reason: string | null;
  performed_by: string | null;
  note: string | null;
  created_at: string;
};

export type InventoryMovementWithDetails = InventoryStockMovementRow & {
  item_name: string;
  item_sku: string;
  unit_of_measure: InventoryUnitOfMeasure;
  location_name: string;
  related_location_name: string | null;
};

export type InventoryRequisitionRow = {
  id: string;
  tenant_id: string;
  requisition_number: string;
  requesting_department: string;
  from_location_id: string;
  status: InventoryRequisitionStatus;
  requested_by: string;
  approved_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryRequisitionLineRow = {
  id: string;
  tenant_id: string;
  requisition_id: string;
  item_id: string;
  qty_requested: number;
  qty_issued: number;
  created_at: string;
};

export type InventoryRequisitionWithLines = InventoryRequisitionRow & {
  from_location_name: string;
  lines: (InventoryRequisitionLineRow & { item_name: string; item_sku: string; unit_of_measure: InventoryUnitOfMeasure })[];
};

export type InventoryTransferRow = {
  id: string;
  tenant_id: string;
  transfer_number: string;
  from_location_id: string;
  to_location_id: string;
  status: InventoryTransferStatus;
  initiated_by: string;
  received_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryTransferLineRow = {
  id: string;
  tenant_id: string;
  transfer_id: string;
  item_id: string;
  qty: number;
  created_at: string;
};

export type InventoryTransferWithLines = InventoryTransferRow & {
  from_location_name: string;
  to_location_name: string;
  lines: (InventoryTransferLineRow & { item_name: string; item_sku: string; unit_of_measure: InventoryUnitOfMeasure })[];
};

export type InventoryReceiptRow = {
  id: string;
  tenant_id: string;
  receipt_number: string;
  location_id: string;
  supplier_id: string | null;
  supplier_name: string | null;
  procurement_reference: string | null;
  received_by: string;
  notes: string | null;
  created_at: string;
};

export type InventoryReceiptLineRow = {
  id: string;
  tenant_id: string;
  receipt_id: string;
  item_id: string;
  qty_received: number;
  unit_cost: number;
  created_at: string;
};

export type InventoryReceiptWithLines = InventoryReceiptRow & {
  location_name: string;
  lines: (InventoryReceiptLineRow & { item_name: string; item_sku: string; unit_of_measure: InventoryUnitOfMeasure })[];
};

export type InventoryStockCountRow = {
  id: string;
  tenant_id: string;
  location_id: string;
  count_date: string;
  status: InventoryStockCountStatus;
  started_by: string | null;
  posted_by: string | null;
  posted_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type InventoryStockCountLineRow = {
  id: string;
  tenant_id: string;
  count_id: string;
  item_id: string;
  system_qty: number;
  counted_qty: number | null;
  created_at: string;
};

export type InventoryStockCountWithLines = InventoryStockCountRow & {
  location_name: string;
  lines: (InventoryStockCountLineRow & {
    item_name: string;
    item_sku: string;
    unit_of_measure: InventoryUnitOfMeasure;
    variance: number | null;
  })[];
};

