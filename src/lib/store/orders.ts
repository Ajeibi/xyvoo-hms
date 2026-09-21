export type StoreOrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  line_total: number;
};

export type StoreOrderRow = {
  id: string;
  tenant_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  status: "Pending" | "Confirmed" | "Shipped" | "Delivered" | "Cancelled";
  payment_method: string;
  total_amount: number;
  profit: number;
  platform_fee: number;
  platform_fee_percentage: number | null;
  created_at: string;
  updated_at: string;
  store_order_items?: StoreOrderItemRow[];
};

export type DashboardOrder = {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  status: StoreOrderRow["status"];
  paymentMethod: string;
  totalAmount: number;
  profit: number;
  platformFee: number;
  platformFeePercentage: number | null;
  itemCount: number;
  items: StoreOrderItemRow[];
  createdAt: string;
};

export function mapOrderRowToDashboard(row: StoreOrderRow): DashboardOrder {
  const items = row.store_order_items || [];
  return {
    id: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    status: row.status,
    paymentMethod: row.payment_method,
    totalAmount: Number(row.total_amount) || 0,
    profit: Number(row.profit) || 0,
    platformFee: Number(row.platform_fee) || 0,
    platformFeePercentage: row.platform_fee_percentage,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
    createdAt: row.created_at,
  };
}
