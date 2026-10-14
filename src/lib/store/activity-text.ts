import { formatShopCurrency } from "@/lib/shop/format";

/*
 * Pure helpers for the activity log: working out what changed, and turning a
 * log entry into a sentence a shop owner can read, e.g. "Ada changed the
 * price of Linen Shirt from ₦10,000 to ₦12,000". No database access here, so
 * the same code runs in tests, routes and pages.
 */

export const ACTIVITY_AREAS = [
  "products",
  "orders",
  "discounts",
  "gift_cards",
  "customers",
  "campaigns",
  "loyalty",
  "referrals",
  "returns",
  "wholesale",
  "blog",
  "staff",
  "settings",
  "payouts",
  "payments",
  "currencies",
  "domain",
  "plan",
  "alerts",
] as const;
export type ActivityArea = (typeof ACTIVITY_AREAS)[number];

export const ACTIVITY_AREA_LABELS: Record<ActivityArea, string> = {
  products: "Products",
  orders: "Orders",
  discounts: "Discounts",
  gift_cards: "Gift cards",
  customers: "Customers",
  campaigns: "Email campaigns",
  loyalty: "Loyalty points",
  referrals: "Referrals",
  returns: "Returns",
  wholesale: "Trade accounts",
  blog: "Blog",
  staff: "Team",
  settings: "Store details",
  payouts: "Payouts",
  payments: "Ways to pay",
  currencies: "Currencies",
  domain: "Web address",
  plan: "Plan",
  alerts: "Alerts",
};

export function isActivityArea(value: unknown): value is ActivityArea {
  return typeof value === "string" && (ACTIVITY_AREAS as readonly string[]).includes(value);
}

export type ActivityChange = { from: unknown; to: unknown };
export type ActivityChanges = Record<string, ActivityChange>;

type FieldKind = "text" | "long" | "money" | "number" | "boolean" | "list" | "date" | "percent" | "hidden";
type FieldInfo = { label: string; kind: FieldKind };

/** How each field reads in a sentence. Fields not listed read as their name with underscores as spaces. */
const FIELDS: Record<string, FieldInfo> = {
  name: { label: "name", kind: "text" },
  slug: { label: "web link", kind: "text" },
  sku: { label: "SKU", kind: "text" },
  barcode: { label: "barcode", kind: "text" },
  brand: { label: "brand", kind: "text" },
  category: { label: "category", kind: "text" },
  subcategory: { label: "subcategory", kind: "text" },
  tags: { label: "tags", kind: "list" },
  status: { label: "status", kind: "text" },
  visibility: { label: "visibility", kind: "text" },
  condition: { label: "condition", kind: "text" },
  description: { label: "description", kind: "long" },
  short_description: { label: "short description", kind: "long" },
  image_url: { label: "main photo", kind: "long" },
  image_urls: { label: "photos", kind: "long" },
  image_alt_texts: { label: "photo descriptions", kind: "long" },
  video_urls: { label: "videos", kind: "long" },
  product_options: { label: "options", kind: "long" },
  price: { label: "price", kind: "money" },
  compare_at_price: { label: "compare-at price", kind: "money" },
  cost_price: { label: "cost price", kind: "money" },
  delivery_extra: { label: "extra delivery charge", kind: "money" },
  taxable: { label: "VAT setting", kind: "boolean" },
  tax_class: { label: "VAT rate", kind: "text" },
  sale_price: { label: "sale price", kind: "money" },
  sale_starts_at: { label: "sale start", kind: "date" },
  sale_ends_at: { label: "sale end", kind: "date" },
  minimum_order_qty: { label: "minimum order", kind: "number" },
  stock: { label: "stock", kind: "number" },
  reorder_level: { label: "low-stock level", kind: "number" },
  unit: { label: "unit", kind: "text" },
  allow_backorder: { label: "backorder setting", kind: "boolean" },
  weight_kg: { label: "weight (kg)", kind: "number" },
  meta_title: { label: "search title", kind: "text" },
  meta_description: { label: "search description", kind: "long" },
  // Discount codes
  code: { label: "code", kind: "text" },
  kind: { label: "discount type", kind: "text" },
  value: { label: "discount", kind: "number" },
  min_subtotal: { label: "minimum spend", kind: "money" },
  starts_at: { label: "start date", kind: "date" },
  ends_at: { label: "end date", kind: "date" },
  usage_limit: { label: "use limit", kind: "number" },
  per_customer_limit: { label: "limit per customer", kind: "number" },
  is_active: { label: "status", kind: "boolean" },
  product_ids: { label: "products it applies to", kind: "hidden" },
  collection_ids: { label: "collections it applies to", kind: "hidden" },
  // Team
  role: { label: "role", kind: "text" },
  // Store details and payments
  display_name: { label: "shop name", kind: "text" },
  business_email: { label: "email", kind: "text" },
  phone: { label: "phone number", kind: "text" },
  whatsapp: { label: "WhatsApp number", kind: "text" },
  address_line1: { label: "address", kind: "text" },
  address_line2: { label: "address line 2", kind: "text" },
  city: { label: "town or city", kind: "text" },
  state: { label: "state", kind: "text" },
  country_code: { label: "country", kind: "text" },
  bank_name: { label: "bank", kind: "text" },
  account_name: { label: "account name", kind: "text" },
  account_number_last4: { label: "account number ending", kind: "text" },
  business_name: { label: "business name", kind: "text" },
  currencies: { label: "currencies", kind: "list" },
  web_address: { label: "web address", kind: "text" },
  plan: { label: "plan", kind: "text" },
};

export function fieldLabel(field: string) {
  return FIELDS[field]?.label ?? field.replace(/_/g, " ");
}

const MAX_TEXT = 300;
const MAX_LIST = 20;

/** Keeps stored values small: long text is cut, long lists are shortened. */
export function compactValue(value: unknown): unknown {
  if (typeof value === "string") return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
  if (Array.isArray(value)) return value.slice(0, MAX_LIST).map(compactValue);
  if (value && typeof value === "object") {
    const json = JSON.stringify(value);
    return json.length > MAX_TEXT ? "(changed)" : value;
  }
  return value ?? null;
}

const same = (a: unknown, b: unknown) => {
  const norm = (v: unknown) => (v === undefined || v === "" ? null : v);
  const x = norm(a);
  const y = norm(b);
  // "10000" from a form and 10000 from the database are the same price.
  if ((typeof x === "number" || typeof y === "number") && x !== null && y !== null && Number(x) === Number(y)) return true;
  return JSON.stringify(x) === JSON.stringify(y);
};

/**
 * What changed between two versions of a record: { field: { from, to } } for
 * each field in `after` whose value differs. Only the given fields are
 * compared when `fields` is passed.
 */
export function diffFields(before: Record<string, unknown> | null | undefined, after: Record<string, unknown>, fields?: readonly string[]): ActivityChanges {
  const changes: ActivityChanges = {};
  for (const field of fields ?? Object.keys(after)) {
    if (!Object.prototype.hasOwnProperty.call(after, field)) continue;
    const from = before?.[field];
    const to = after[field];
    if (same(from, to)) continue;
    changes[field] = { from: compactValue(from), to: compactValue(to) };
  }
  return changes;
}

export function formatActivityValue(field: string, value: unknown, currency = "NGN"): string {
  const kind = FIELDS[field]?.kind ?? "text";
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) return "nothing";
  if (kind === "money" && Number.isFinite(Number(value))) return formatShopCurrency(Number(value), currency);
  if (kind === "number" && Number.isFinite(Number(value))) return Number(value).toLocaleString("en-GB");
  if (kind === "boolean") {
    if (field === "is_active") return value ? "active" : "paused";
    return value ? "on" : "off";
  }
  if (kind === "date" && typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }
  if (Array.isArray(value)) return value.map((v) => String(v)).join(", ");
  if (field === "role" && typeof value === "string") return value.charAt(0).toUpperCase() + value.slice(1);
  if (typeof value === "object") return "changed";
  return String(value);
}

/** One readable line per changed field, e.g. "price from ₦10,000 to ₦12,000" or "description". */
export function describeChange(field: string, change: ActivityChange, currency = "NGN") {
  const kind = FIELDS[field]?.kind ?? "text";
  if (kind === "long" || kind === "hidden") return fieldLabel(field);
  return `${fieldLabel(field)} from ${formatActivityValue(field, change.from, currency)} to ${formatActivityValue(field, change.to, currency)}`;
}

export type ActivityEntry = {
  actor_name: string;
  area: string;
  action: string;
  target_label: string | null;
  changes: ActivityChanges | null;
};

const quoteTarget = (label: string | null) => (label ? label : "an item");

/** What the thing changed is called in a sentence, e.g. "the product Linen Shirt". */
function thing(area: string, label: string | null) {
  const t = quoteTarget(label);
  switch (area) {
    case "products":
      return `the product ${t}`;
    case "discounts":
      return `the discount code ${t}`;
    case "orders":
      return `order ${t}`;
    default:
      return t;
  }
}

/** The whole sentence for one log entry, without the time. */
export function activitySentence(entry: ActivityEntry, currency = "NGN"): string {
  const who = entry.actor_name?.trim() || "Someone";
  const label = entry.target_label;
  const changes = entry.changes && typeof entry.changes === "object" ? entry.changes : {};
  const fields = Object.keys(changes);

  const changed = (subject: string) => {
    if (!fields.length) return `${who} updated ${subject}`;
    const [first, ...rest] = fields;
    const firstText = describeChange(first, changes[first], currency);
    const kind = FIELDS[first]?.kind ?? "text";
    // "changed the price of Linen Shirt from ₦10,000 to ₦12,000"
    const lead =
      kind === "long" || kind === "hidden"
        ? `${who} changed the ${firstText} of ${subject}`
        : `${who} changed the ${fieldLabel(first)} of ${subject} ${firstText.slice(fieldLabel(first).length + 1)}`;
    return rest.length ? `${lead}, and ${rest.length} other ${rest.length === 1 ? "detail" : "details"}` : lead;
  };

  switch (`${entry.area}:${entry.action}`) {
    case "products:created":
      return `${who} added ${thing("products", label)}`;
    case "products:deleted":
      return `${who} deleted ${thing("products", label)}`;
    case "products:updated":
      return changed(quoteTarget(label));
    case "products:added_to_collection":
      return `${who} added ${thing("products", label)} to a collection`;
    case "products:removed_from_collection":
      return `${who} took ${thing("products", label)} out of a collection`;
    case "discounts:created":
      return `${who} created ${thing("discounts", label)}`;
    case "discounts:deleted":
      return `${who} deleted ${thing("discounts", label)}`;
    case "discounts:paused":
      return `${who} paused ${thing("discounts", label)}`;
    case "discounts:resumed":
      return `${who} switched on ${thing("discounts", label)}`;
    case "discounts:updated":
      return changed(thing("discounts", label));
    case "orders:recorded":
      return `${who} recorded ${thing("orders", label)} by hand`;
    case "blog:created":
      return `${who} started the blog post ${quoteTarget(label)}`;
    case "blog:published":
      return `${who} published the blog post ${quoteTarget(label)}`;
    case "blog:updated":
      return `${who} changed the blog post ${quoteTarget(label)}`;
    case "blog:deleted":
      return `${who} removed the blog post ${quoteTarget(label)}`;
    case "wholesale:settings":
      return `${who} changed the trade account settings`;
    case "wholesale:switched_off":
      return `${who} switched off trade accounts`;
    case "wholesale:approve":
      return `${who} approved a trade account`;
    case "wholesale:decline":
      return `${who} declined a trade account`;
    case "wholesale:revoke":
      return `${who} ended a trade account`;
    case "returns:approve":
      return `${who} approved a return on order ${quoteTarget(label)}`;
    case "returns:decline":
      return `${who} declined a return on order ${quoteTarget(label)}`;
    case "returns:received":
      return `${who} received a return on order ${quoteTarget(label)}`;
    case "returns:complete":
      return `${who} completed a return on order ${quoteTarget(label)}`;
    case "returns:cancel":
      return `${who} cancelled a return on order ${quoteTarget(label)}`;
    case "returns:window":
      return `${who} set the return window to ${quoteTarget(label)}`;
    case "referrals:settings":
      return `${who} changed the referral offer`;
    case "referrals:switched_off":
      return `${who} switched off referrals`;
    case "loyalty:settings":
      return `${who} changed the loyalty points settings`;
    case "loyalty:switched_off":
      return `${who} switched off loyalty points`;
    case "loyalty:added":
      return `${who} added ${quoteTarget(label)}`;
    case "loyalty:removed":
      return `${who} removed ${quoteTarget(label)}`;
    case "campaigns:created":
      return `${who} started the email campaign ${quoteTarget(label)}`;
    case "campaigns:updated":
      return `${who} changed the email campaign ${quoteTarget(label)}`;
    case "campaigns:deleted":
      return `${who} removed the email campaign ${quoteTarget(label)}`;
    case "campaigns:sent":
      return `${who} sent an email campaign to ${quoteTarget(label)}`;
    case "campaigns:scheduled":
      return `${who} scheduled an email campaign for ${quoteTarget(label)}`;
    case "campaigns:stopped":
      return `${who} stopped an email campaign`;
    case "customers:group_created":
      return `${who} created the customer group ${quoteTarget(label)}`;
    case "customers:group_updated":
      return `${who} changed the customer group ${quoteTarget(label)}`;
    case "customers:group_deleted":
      return `${who} removed the customer group ${quoteTarget(label)}`;
    case "gift_cards:issued":
      return `${who} sent a gift card to ${quoteTarget(label)}`;
    case "gift_cards:disabled":
      return `${who} switched off the gift card for ${quoteTarget(label)}`;
    case "gift_cards:enabled":
      return `${who} switched on the gift card for ${quoteTarget(label)}`;
    case "gift_cards:resent":
      return `${who} sent the gift card for ${quoteTarget(label)} again`;
    case "gift_cards:settings":
      return `${who} changed the gift card settings`;
    case "staff:invited":
      return `${who} invited ${quoteTarget(label)} to the team`;
    case "staff:invite_resent":
      return `${who} sent ${quoteTarget(label)}'s invitation again`;
    case "staff:invite_cancelled":
      return `${who} cancelled ${quoteTarget(label)}'s invitation`;
    case "staff:joined":
      return `${who} joined the team`;
    case "staff:role_changed":
      return changes.role
        ? `${who} changed ${quoteTarget(label)}'s role from ${formatActivityValue("role", changes.role.from)} to ${formatActivityValue("role", changes.role.to)}`
        : `${who} changed ${quoteTarget(label)}'s role`;
    case "staff:removed":
      return `${who} removed ${quoteTarget(label)} from the team`;
    case "staff:left":
      return `${who} left the team`;
    case "settings:updated":
      return changed("the store details").replace(" of the store details", "");
    case "settings:paystack_keys_updated":
      return `${who} updated the shop's own Paystack keys`;
    case "payouts:updated":
      return changed("the payout account");
    case "payments:updated":
      return `${who} changed the ways customers can pay`;
    case "currencies:updated":
      return changes.currencies
        ? `${who} changed the currencies shown from ${formatActivityValue("currencies", changes.currencies.from)} to ${formatActivityValue("currencies", changes.currencies.to)}`
        : `${who} changed the currencies shown in the shop`;
    case "domain:updated":
      return changes.web_address
        ? `${who} changed the web address from ${formatActivityValue("web_address", changes.web_address.from)} to ${formatActivityValue("web_address", changes.web_address.to)}`
        : `${who} changed the web address`;
    case "plan:subscribed":
      return `${who} started paying for the Standard plan`;
    case "plan:cancelled":
      return `${who} cancelled the Standard plan`;
    case "alerts:updated":
      return `${who} changed the shop's alert settings`;
    default:
      return `${who} ${entry.action.replace(/_/g, " ")} ${label ?? ""}`.trim();
  }
}

/** Every change as its own line, for the details under a sentence. */
export function activityDetails(changes: ActivityChanges | null | undefined, currency = "NGN") {
  if (!changes || typeof changes !== "object") return [];
  return Object.entries(changes).map(([field, change]) => {
    const text = describeChange(field, change, currency);
    return text.charAt(0).toUpperCase() + text.slice(1);
  });
}

/** "just now", "2 hours ago", "3 days ago", or a date for anything older than a week. */
export function timeAgo(iso: string, now = Date.now()) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const seconds = Math.round((now - then) / 1000);
  if (seconds < 45) return "just now";
  const rtf = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return rtf.format(-minutes, "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  const days = Math.round(hours / 24);
  if (days < 7) return rtf.format(-days, "day");
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
