export type VendorStatus = "active" | "preferred" | "inactive" | "blacklisted";

export type VendorCategoryRow = {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type VendorCertification = { label: string };

export type VendorRow = {
  id: string;
  tenant_id: string;
  name: string;
  category_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  country: string | null;
  currency: string;
  payment_terms: string | null;
  lead_time_days: number;
  status: VendorStatus;
  certifications: VendorCertification[];
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type VendorWithCategory = VendorRow & { category_name: string | null };

export type VendorPriceCatalogRow = {
  id: string;
  tenant_id: string;
  vendor_id: string;
  item_id: string;
  unit_price: number;
  currency: string;
  moq: number;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
};

export type VendorPriceCatalogWithItem = VendorPriceCatalogRow & {
  item_name: string;
  item_sku: string;
  unit_of_measure: string;
};

export type VendorPerformanceReviewRow = {
  id: string;
  tenant_id: string;
  vendor_id: string;
  po_id: string | null;
  on_time: boolean;
  quality_score: number;
  notes: string | null;
  reviewed_by: string;
  created_at: string;
};

export type VendorScorecard = {
  vendorId: string;
  totalOrders: number;
  onTimeRate: number | null;
  avgQualityScore: number | null;
  qualityRejectionRate: number | null;
  totalSpend: number;
};

export type ApproverRole = "auto" | "gm" | "finance";

export type ApprovalThresholdRow = {
  id: string;
  tenant_id: string;
  department: string;
  min_amount: number;
  max_amount: number | null;
  approver_role: ApproverRole;
  sort_order: number;
  created_at: string;
};

export type PurchaseOrderStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "ordered"
  | "partially_received"
  | "received"
  | "closed"
  | "rejected"
  | "cancelled";

export type PurchaseOrderRow = {
  id: string;
  tenant_id: string;
  po_number: string;
  vendor_id: string;
  department: string;
  status: PurchaseOrderStatus;
  currency: string;
  fx_rate: number;
  subtotal: number;
  tax: number;
  total: number;
  expected_delivery_date: string | null;
  is_manual: boolean;
  manual_reason: string | null;
  notes: string | null;
  requested_by: string | null;
  created_by: string;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  invoice_number: string | null;
  invoice_amount: number | null;
  invoice_matched_at: string | null;
  invoice_variance: number | null;
  created_at: string;
  updated_at: string;
};

export type PurchaseOrderLineRow = {
  id: string;
  tenant_id: string;
  po_id: string;
  requisition_line_id: string | null;
  item_id: string | null;
  description: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
  quantity_received: number;
  created_at: string;
};

export type PurchaseOrderLineWithItem = PurchaseOrderLineRow & {
  item_name: string | null;
  item_sku: string | null;
  unit_of_measure: string | null;
};

export type PurchaseOrderWithLines = PurchaseOrderRow & {
  vendor_name: string;
  lines: PurchaseOrderLineWithItem[];
  requiredApproverRole: ApproverRole;
};

export type ProcurementBudgetRow = {
  id: string;
  tenant_id: string;
  department: string;
  period_start: string;
  period_end: string;
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
};

export type ProcurementBudgetWithSpend = ProcurementBudgetRow & {
  spent: number;
  remaining: number;
  percentUsed: number;
};

export type QualityChecklistRow = {
  id: string;
  tenant_id: string;
  item_type_id: string;
  checklist_items: string[];
  created_at: string;
  updated_at: string;
};

export type QualityChecklistWithItemType = QualityChecklistRow & { item_type_name: string };

export type DiscrepancyType = "none" | "short_delivered" | "damaged" | "wrong_item" | "failed_inspection";

export type ProcurementReceiptLineInput = {
  purchaseOrderLineId: string;
  itemId: string;
  qtyReceived: number;
  qtyRejected: number;
  unitCost: number;
  discrepancyType: DiscrepancyType;
  qualityPassed: boolean;
  qualityNotes?: string;
};

export type SourceableRequisitionLine = {
  requisitionId: string;
  requisitionNumber: string;
  requestingDepartment: string;
  requisitionLineId: string;
  itemId: string;
  itemName: string;
  itemSku: string;
  unitOfMeasure: string;
  unitCost: number;
  qtyRequested: number;
  qtyIssued: number;
  qtySourced: number;
  qtyRemaining: number;
};

export type ProcurementDashboardStats = {
  requisitionsAwaitingSourcing: number;
  ordersPendingApproval: number;
  ordersOverdue: number;
  openOrders: number;
  budgetBurnPercent: number | null;
  activeVendors: number;
};
