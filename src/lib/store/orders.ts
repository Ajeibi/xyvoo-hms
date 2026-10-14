export type StoreOrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id?: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  cost_price: number;
  line_total: number;
  restocked_quantity?: number | null;
};

export type OrderPaymentStatus = "unpaid" | "paid" | "failed" | "refunded";

export type StoreOrderRow = {
  id: string;
  tenant_id: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  status: "Pending" | "Confirmed" | "Shipped" | "Delivered" | "Cancelled";
  payment_method: string;
  payment_status?: OrderPaymentStatus;
  delivery_method?: string | null;
  delivery_fee?: number | string | null;
  discount_code?: string | null;
  discount_amount?: number | string | null;
  shipping_address?: Record<string, string | undefined> | null;
  currency?: string | null;
  refunded_amount?: number | string | null;
  tracking_number?: string | null;
  tracking_carrier?: string | null;
  total_amount: number;
  profit: number;
  platform_fee: number;
  platform_fee_percentage: number | null;
  paid_at?: string | null;
  /** Where it was sold: "online", or recorded by hand ("in_person", "phone", ...). */
  channel?: string | null;
  shop_note?: string | null;
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
  paymentStatus: OrderPaymentStatus;
  deliveryMethod: string | null;
  deliveryFee: number;
  shippingAddress: Record<string, string | undefined>;
  /** The currency the order was placed in. */
  currency: string;
  totalAmount: number;
  /** Money given back so far. */
  refundedAmount: number;
  profit: number;
  /** The code and amount taken off, if the customer used a discount code. */
  discountCode: string | null;
  discountAmount: number;
  platformFee: number;
  platformFeePercentage: number | null;
  trackingNumber: string | null;
  trackingCarrier: string | null;
  itemCount: number;
  items: StoreOrderItemRow[];
  /** "online", or where an order recorded by hand was sold. */
  channel: string;
  /** The team's own note on an order recorded by hand. */
  shopNote: string | null;
  createdAt: string;
};

/** fallbackCurrency is the shop's currency, for orders saved before orders kept their own. */
export function mapOrderRowToDashboard(row: StoreOrderRow, fallbackCurrency = "NGN"): DashboardOrder {
  const items = row.store_order_items || [];
  return {
    id: row.id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    status: row.status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status ?? "unpaid",
    deliveryMethod: row.delivery_method ?? null,
    deliveryFee: Number(row.delivery_fee) || 0,
    shippingAddress: row.shipping_address ?? {},
    currency: row.currency || fallbackCurrency,
    totalAmount: Number(row.total_amount) || 0,
    refundedAmount: Number(row.refunded_amount) || 0,
    profit: Number(row.profit) || 0,
    discountCode: row.discount_code ?? null,
    discountAmount: Number(row.discount_amount) || 0,
    platformFee: Number(row.platform_fee) || 0,
    platformFeePercentage: row.platform_fee_percentage,
    trackingNumber: row.tracking_number ?? null,
    trackingCarrier: row.tracking_carrier ?? null,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    items,
    channel: row.channel || "online",
    shopNote: row.shop_note ?? null,
    createdAt: row.created_at,
  };
}

/** Short order reference shown to customers and shops, e.g. "3F9A12BC". */
export const orderRef = (orderId: string) => orderId.slice(0, 8).toUpperCase();
