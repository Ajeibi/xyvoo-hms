"use client";

import { useRef, useState, type ReactNode } from "react";
import styles from "./StorefrontModuleCarousel.module.css";

type Tag = {
  key: string;
  icon: ReactNode;
  label: string;
  detail: string;
};

const STOREFRONT_ICON: ReactNode = (
  <>
    <path d="M4 9V4h16v5" />
    <path d="M4 9a2 2 0 004 0 2 2 0 004 0 2 2 0 004 0 2 2 0 004 0" />
    <path d="M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9" />
    <path d="M10 20v-5h4v5" />
  </>
);
const CATALOG_ICON: ReactNode = (
  <>
    <path d="M3 8l9-5 9 5-9 5-9-5z" />
    <path d="M3 8v9l9 5 9-5V8" />
    <path d="M12 13v9" />
  </>
);
const ORDERS_ICON: ReactNode = (
  <>
    <path d="M3 7h11v9H3z" />
    <path d="M14 10h4l3 3v3h-7z" />
    <circle cx="7" cy="18" r="1.6" fill="#fff" stroke="none" />
    <circle cx="17" cy="18" r="1.6" fill="#fff" stroke="none" />
  </>
);
const PAYMENTS_ICON: ReactNode = (
  <>
    <rect x="3" y="6" width="18" height="13" rx="2" />
    <path d="M3 10h18" />
    <circle cx="17" cy="14.5" r="1.4" fill="#fff" stroke="none" />
  </>
);
const MARKETING_ICON: ReactNode = (
  <>
    <path d="M3 17l5-5 4 4 8-9" />
    <path d="M15 6h5v5" />
  </>
);
const TEAM_ICON: ReactNode = (
  <>
    <circle cx="12" cy="7.5" r="3" />
    <circle cx="4.5" cy="9.5" r="2.4" />
    <circle cx="19.5" cy="9.5" r="2.4" />
    <path d="M1.5 20c0-3 1.9-5.1 4.7-5.5M22.5 20c0-3-1.9-5.1-4.7-5.5M6.7 20c0-3.3 2.3-6 5.3-6s5.3 2.7 5.3 6" />
  </>
);
const ANALYTICS_ICON: ReactNode = (
  <>
    <path d="M5 20V12" />
    <path d="M12 20V6" />
    <path d="M19 20v-9" />
  </>
);

/** Every tag traces back to a real module and one of its actual bullets
 * (see SOLUTIONS_STOREFRONT_STACK_MODULES) — nothing invented here, just
 * broken into shorter, tag-sized pieces so the carousel has real depth
 * instead of just the 7 top-level category names. */
const TAGS: Tag[] = [
  {
    key: "storefront",
    icon: STOREFRONT_ICON,
    label: "Storefront & Website",
    detail:
      "A ready-to-use storefront on your own subdomain — your logo, your colours, your identity. Shoppers never see XYVOO.",
  },
  {
    key: "live-in-minutes",
    icon: STOREFRONT_ICON,
    label: "Live in minutes",
    detail: "A live storefront the moment you sign up — no hosting setup required.",
  },
  {
    key: "installable-pwa",
    icon: STOREFRONT_ICON,
    label: "Installable PWA",
    detail: "Mobile-first, installable straight from the browser like an app.",
  },
  {
    key: "catalog",
    icon: CATALOG_ICON,
    label: "Catalog & Inventory",
    detail:
      "Variants, pricing, and stock tied together so overselling is harder — with bulk tools for large catalogues.",
  },
  {
    key: "real-time-stock",
    icon: CATALOG_ICON,
    label: "Real-time stock",
    detail: "Variants, categories and bundles with real-time stock updates.",
  },
  {
    key: "bulk-import",
    icon: CATALOG_ICON,
    label: "Bulk import",
    detail: "Bulk import and batch edits for fast merchandising.",
  },
  {
    key: "orders",
    icon: ORDERS_ICON,
    label: "Orders & Fulfilment",
    detail:
      "End-to-end order management from placement through fulfilment, with shipping rules that keep delivery predictable.",
  },
  {
    key: "order-board",
    icon: ORDERS_ICON,
    label: "Unified order board",
    detail: "Fulfilment statuses and delivery handoff, all in one board.",
  },
  {
    key: "shipping-rules",
    icon: ORDERS_ICON,
    label: "Shipping rules",
    detail: "Shipping rules by zone or weight, plus returns handled in one flow.",
  },
  {
    key: "payments",
    icon: PAYMENTS_ICON,
    label: "Payments & Checkout",
    detail:
      "Paystack-ready checkout today, with room to add Flutterwave and Stripe as you grow — card, transfer and USSD supported.",
  },
  {
    key: "paystack-checkout",
    icon: PAYMENTS_ICON,
    label: "Paystack checkout",
    detail: "Receipts and order confirmation built in, from day one.",
  },
  {
    key: "sales-analytics-feed",
    icon: PAYMENTS_ICON,
    label: "Sales analytics feed",
    detail: "Checkout events feed straight into your sales analytics.",
  },
  {
    key: "marketing",
    icon: MARKETING_ICON,
    label: "Marketing & Growth",
    detail:
      "Surface products on search and reach buyers directly, without bolting on a separate marketing tool.",
  },
  {
    key: "seo-controls",
    icon: MARKETING_ICON,
    label: "SEO controls",
    detail: "Built-in SEO controls for your storefront and product pages.",
  },
  {
    key: "discount-codes",
    icon: MARKETING_ICON,
    label: "Discount codes",
    detail: "Promotions and email marketing lists and sends, built in.",
  },
  {
    key: "team",
    icon: TEAM_ICON,
    label: "Team & Access",
    detail:
      "Scale operations without handing everyone admin keys — invite staff and control what each person can reach.",
  },
  {
    key: "role-based-access",
    icon: TEAM_ICON,
    label: "Role-based access",
    detail: "Staff invites with role-based dashboard access.",
  },
  {
    key: "centralised-config",
    icon: TEAM_ICON,
    label: "Centralised config",
    detail: "Centralised storefront configuration — one source of truth.",
  },
  {
    key: "analytics",
    icon: ANALYTICS_ICON,
    label: "Analytics & Reporting",
    detail:
      "Sales performance, order volumes and traffic insights scoped to your storefront — not shared with other merchants.",
  },
  {
    key: "live-dashboard",
    icon: ANALYTICS_ICON,
    label: "Live dashboard",
    detail: "Live dashboard for sales, orders and top-selling products.",
  },
  {
    key: "scoped-data",
    icon: ANALYTICS_ICON,
    label: "Scoped data",
    detail: "Your data stays scoped to your storefront alone.",
  },
];

/** Round-robin across 3 lines so each one mixes modules instead of running
 * one module at a time. */
const COLUMNS: Tag[][] = [[], [], []];
TAGS.forEach((tag, i) => COLUMNS[i % 3].push(tag));

/** Alternating per line: top-to-bottom, bottom-to-top, top-to-bottom. */
const DIRECTION: ("down" | "up")[] = ["down", "up", "down"];

/** Detail panel's own width — used to keep it clear of the carousel's
 * left/right edges when it's centred under a card near either side. */
const PANEL_WIDTH = 280;

export function StorefrontModuleCarousel() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{ tag: Tag; top: number; left: number } | null>(null);

  function handleEnter(tag: Tag, cardEl: HTMLElement) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const wrapRect = wrap.getBoundingClientRect();
    const cardRect = cardEl.getBoundingClientRect();
    const rawLeft = cardRect.left - wrapRect.left + cardRect.width / 2;
    const left = Math.min(
      Math.max(rawLeft, PANEL_WIDTH / 2 + 8),
      wrapRect.width - PANEL_WIDTH / 2 - 8,
    );
    setActive({
      tag,
      top: cardRect.bottom - wrapRect.top + 12,
      left,
    });
  }

  return (
    <div className={styles.wrap} ref={wrapRef}>
      {/* `.columns:has(.card:hover)` (in the CSS) pauses every line at
          once and dims every other card, so hovering one card stops all
          the movement and puts the focus squarely on it. */}
      <div className={styles.columns}>
        {COLUMNS.map((col, colIndex) => (
          <div className={styles.column} key={colIndex}>
            <div className={`${styles.track} ${styles[DIRECTION[colIndex]]}`}>
              {[...col, ...col].map((tag, i) => (
                <button
                  key={`${tag.key}-${i}`}
                  type="button"
                  className={styles.card}
                  onMouseEnter={(e) => handleEnter(tag, e.currentTarget)}
                  onFocus={(e) => handleEnter(tag, e.currentTarget)}
                  onMouseLeave={() => setActive(null)}
                  onBlur={() => setActive(null)}
                >
                  <svg className={styles.ic} viewBox="0 0 24 24">
                    {tag.icon}
                  </svg>
                  <span>{tag.label}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {active && (
        <div
          className={styles.detail}
          style={{ top: active.top, left: active.left }}
          aria-live="polite"
        >
          <h4>{active.tag.label}</h4>
          <p>{active.tag.detail}</p>
        </div>
      )}
    </div>
  );
}
