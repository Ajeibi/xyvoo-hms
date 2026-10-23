import type { ShopProduct } from "@/lib/shop/products";
import { STORE_PATHS } from "@/lib/store/site/links";

/*
 * The shop's product feed: one RSS 2.0 file in Google's product data format,
 * which Google Merchant Center reads as it is and Meta Commerce Manager
 * (Facebook and Instagram) accepts as a "data feed". A product with options
 * becomes one item per option (size, colour…) grouped by the product's id,
 * so the ids here match the ids the shop's Meta Pixel and Google tag send.
 */

/** Where the feed lives on a shop's own address. */
export const PRODUCT_FEED_PATH = "/feeds/products.xml";

export type FeedItem = {
  id: string;
  groupId: string | null;
  title: string;
  description: string;
  link: string;
  imageLink: string;
  additionalImageLinks: string[];
  availability: "in_stock" | "out_of_stock" | "preorder";
  /** "12500.00 NGN": the normal price. */
  price: string;
  /** Today's price, when it's below the normal one. */
  salePrice: string | null;
  brand: string;
  gtin: string | null;
  productType: string | null;
  shippingWeight: string | null;
  color: string | null;
  size: string | null;
};

const money = (amount: number, currency: string) => `${amount.toFixed(2)} ${currency.toUpperCase()}`;

/** Plain text from a description that may hold HTML, on one line per paragraph. */
export function plainText(value: string | null | undefined) {
  return (value || "")
    .replace(/<(br|\/p|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

/** A barcode Google and Meta accept as a GTIN: 8, 12, 13 or 14 digits with a correct check digit. */
export function validGtin(code: string | null | undefined): string | null {
  const digits = (code || "").trim();
  if (!/^(\d{8}|\d{12,14})$/.test(digits)) return null;
  const body = digits.slice(0, -1).split("").reverse();
  const sum = body.reduce((total, d, i) => total + Number(d) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === Number(digits.at(-1)) ? digits : null;
}

const optionValue = (options: Record<string, string>, pattern: RegExp) =>
  Object.entries(options).find(([name]) => pattern.test(name))?.[1]?.trim() || null;

/** Prices for the feed: the normal price, plus a sale price while the shop shows one struck through. */
function prices(price: number, compareAt: number | null, currency: string) {
  if (compareAt != null && compareAt > price) return { price: money(compareAt, currency), salePrice: money(price, currency) };
  return { price: money(price, currency), salePrice: null };
}

function availability(product: ShopProduct, stock: number): FeedItem["availability"] {
  if (product.preorder) return "preorder";
  // Backorders can be bought today, so they're in stock as far as shoppers are concerned.
  return product.allowBackorder || stock > 0 ? "in_stock" : "out_of_stock";
}

/**
 * The feed's items for a shop's products. Products without a picture are left
 * out (both Google and Meta turn them down), as are services, which neither
 * allows. Prices are today's: a sale shows as a sale price.
 */
export function feedItems(products: ShopProduct[], shop: { siteUrl: string; storeName: string }): FeedItem[] {
  return products.flatMap((product): FeedItem[] => {
    if (product.productType === "service" || product.productType === "subscription") return [];
    const images = [...new Set([product.imageUrl, ...product.imageUrls].filter((url): url is string => Boolean(url)))];
    const productLink = `${shop.siteUrl}${STORE_PATHS.product(product.slug || product.id)}`;
    const description = plainText(product.description) || plainText(product.shortDescription) || product.name;
    const productType = [product.category, product.subcategory].filter(Boolean).join(" > ") || null;
    const shippingWeight = product.weightKg && product.weightKg > 0 ? `${product.weightKg} kg` : null;
    const brand = product.brand?.trim() || shop.storeName;

    const hasVariants = product.productOptions.length > 0 && product.variants.length > 0;
    if (!hasVariants) {
      if (!images.length) return [];
      return [
        {
          id: product.id,
          groupId: null,
          title: product.name.slice(0, 150),
          description: description.slice(0, 5000),
          link: productLink,
          imageLink: images[0],
          additionalImageLinks: images.slice(1, 11),
          availability: availability(product, product.stock),
          ...prices(product.price, product.compareAtPrice, product.currency),
          brand,
          gtin: null,
          productType,
          shippingWeight,
          color: null,
          size: null,
        },
      ];
    }

    return product.variants.flatMap((variant): FeedItem[] => {
      const imageLink = variant.imageUrl || images[0];
      if (!imageLink) return [];
      const label = product.productOptions.map((o) => variant.options[o.name]).filter(Boolean).join(" / ");
      // The same price rules as the product page: a variant with its own price ignores the product's "was" price.
      const price = variant.priceOverride ?? product.price;
      const compareAt = variant.compareAtPrice ?? (variant.priceOverride == null ? product.compareAtPrice : null);
      return [
        {
          id: variant.id,
          groupId: product.id,
          title: (label ? `${product.name} - ${label}` : product.name).slice(0, 150),
          description: description.slice(0, 5000),
          link: `${productLink}?variant=${encodeURIComponent(variant.id)}`,
          imageLink,
          additionalImageLinks: images.filter((url) => url !== imageLink).slice(0, 10),
          availability: availability(product, variant.stock),
          ...prices(price, compareAt, product.currency),
          brand,
          gtin: validGtin(variant.barcode),
          productType,
          shippingWeight,
          color: optionValue(variant.options, /colou?r/i),
          size: optionValue(variant.options, /size/i),
        },
      ];
    });
  });
}

/** Escapes text for XML, dropping characters XML can't carry at all. */
export function escapeXml(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function itemXml(item: FeedItem) {
  const tag = (name: string, value: string | null) => (value ? `      <g:${name}>${escapeXml(value)}</g:${name}>` : null);
  return [
    "    <item>",
    tag("id", item.id),
    tag("item_group_id", item.groupId),
    tag("title", item.title),
    tag("description", item.description),
    tag("link", item.link),
    tag("image_link", item.imageLink),
    ...item.additionalImageLinks.map((url) => tag("additional_image_link", url)),
    tag("availability", item.availability),
    tag("price", item.price),
    tag("sale_price", item.salePrice),
    tag("condition", "new"),
    tag("brand", item.brand),
    tag("gtin", item.gtin),
    // Without a GTIN, say so: most small shops sell their own or unbranded goods.
    item.gtin ? null : tag("identifier_exists", "no"),
    tag("product_type", item.productType),
    tag("shipping_weight", item.shippingWeight),
    tag("color", item.color),
    tag("size", item.size),
    "    </item>",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function productFeedXml(items: FeedItem[], shop: { siteUrl: string; storeName: string; description: string }) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "  <channel>",
    `    <title>${escapeXml(shop.storeName)}</title>`,
    `    <link>${escapeXml(shop.siteUrl)}</link>`,
    `    <description>${escapeXml(shop.description)}</description>`,
    ...items.map(itemXml),
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}

/** An order's lines as the shop's pixels see them, by the product feed's ids. */
export function purchaseLines(items: Array<{ product_id: string | null; variant_id: string | null; product_name: string; quantity: number; line_total: number }>) {
  return items.flatMap((item) => {
    const itemId = item.variant_id ?? item.product_id;
    const quantity = Number(item.quantity) || 0;
    return itemId && quantity > 0 ? [{ itemId, name: item.product_name, quantity, unitPrice: Number(item.line_total) / quantity }] : [];
  });
}
