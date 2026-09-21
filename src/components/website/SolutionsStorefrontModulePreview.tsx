"use client";

import { useEffect, useId, useState } from "react";
import { Check } from "lucide-react";
import styles from "./SolutionsStorefrontModulePreview.module.css";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);
  return reduced;
}

/** Storefront — a live site wireframe: header + a 3x2 grid of product
 * tiles building in on a loop, standing in for "a real storefront
 * structure, live the moment you sign up". */
function StorefrontVisual() {
  return (
    <div className={styles.wireframe}>
      <div className={styles.wfHeader}>
        <span className={styles.wfLogo} />
        <span className={styles.wfNav} />
        <span className={styles.wfNav} />
        <span className={styles.wfNav} />
        <span className={styles.wfCart} />
      </div>
      <div className={styles.wfGrid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={styles.wfCard}>
            <div className={styles.wfCardImage} />
            <div className={styles.wfCardLine} />
            <div className={`${styles.wfCardLine} ${styles.short}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Catalog — a live inventory chart: varying bars with pips, gridlines,
 * baseline and a trend badge, standing in for "real-time stock updates". */
function CatalogVisual() {
  const heights = [58, 92, 70, 100, 64, 82];
  return (
    <div className={styles.catalogChart}>
      <div className={styles.chartGridlines}>
        <span />
        <span />
        <span />
      </div>
      <span className={styles.trendChip}>+18% this week</span>
      <div className={styles.stockChart}>
        {heights.map((h, i) => (
          <div key={i} className={styles.stockBarWrap}>
            <span className={styles.stockPip} />
            <div className={styles.stockBar} style={{ height: `${h}%` }} />
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-[rgb(39_201_63)]">
        <span className={`h-2 w-2 rounded-full bg-[rgb(39_201_63)] ${styles.liveDot}`} />
        Live stock
      </div>
    </div>
  );
}

/** Orders — a small routing network (order splits to payment/packing,
 * merges, then ships) with two dots travelling their own routes, the same
 * idea as the aienai.co reference but with real branching, not one line. */
function OrdersVisual() {
  const reducedMotion = usePrefersReducedMotion();
  const gridId = useId();
  const nodes = [
    { x: 30, y: 132, label: "Order", active: true, labelBelow: true },
    { x: 98, y: 46, label: "Payment", active: false, labelBelow: false },
    { x: 168, y: 102, label: "Packed", active: false, labelBelow: true },
    { x: 232, y: 42, label: "Shipped", active: false, labelBelow: false },
    { x: 278, y: 112, label: "Delivered", active: false, labelBelow: true },
  ];
  const edges = [
    "M30,132 L98,46",
    "M30,132 L168,102",
    "M98,46 L168,102",
    "M168,102 L232,42",
    "M232,42 L278,112",
  ];
  const routeA = "M30,132 L168,102 L232,42 L278,112";
  const routeB = "M30,132 L98,46 L168,102";

  return (
    <svg viewBox="0 0 330 170" className="h-full max-h-[220px] w-full max-w-[380px]" aria-hidden>
      <defs>
        <pattern id={gridId} width="18" height="18" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="rgb(var(--xyvoo-navy-rgb) / 0.08)" />
        </pattern>
      </defs>
      <rect width="330" height="170" fill={`url(#${gridId})`} />
      {edges.map((d) => (
        <path key={d} d={d} className={styles.flowLine} />
      ))}
      {!reducedMotion && (
        <>
          <circle r="4" className={styles.flowDot}>
            <animateMotion dur="3.8s" repeatCount="indefinite" path={routeA} />
          </circle>
          <circle r="3.5" className={styles.flowDotAlt}>
            <animateMotion dur="2.6s" repeatCount="indefinite" path={routeB} />
          </circle>
        </>
      )}
      {nodes.map((n) => (
        <g
          key={n.label}
          className={n.active ? styles.flowNodeActive : styles.flowNode}
          transform={`translate(${n.x}, ${n.y})`}
        >
          <circle r={n.active ? 5.5 : 5} />
          <text
            className={styles.flowLabel}
            x={0}
            y={n.labelBelow ? 18 : -12}
            textAnchor="middle"
          >
            {n.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Payments — a fuller checkout scene: pulsing success badge, the three
 * supported payment methods cycling highlight, and a receipt sliding
 * in, standing in for "card, transfer and USSD, receipts built in". */
function PaymentsVisual() {
  return (
    <div className={styles.paymentScene}>
      <div className={styles.paymentBadge}>
        <span className={styles.paymentRing} aria-hidden />
        <span className={styles.paymentRing} aria-hidden />
        <Check className={`h-9 w-9 text-[rgb(39_201_63)] ${styles.paymentCheck}`} aria-hidden />
      </div>
      <div className={styles.methodRow}>
        <span className={styles.methodChip}>Card</span>
        <span className={styles.methodChip}>Transfer</span>
        <span className={styles.methodChip}>USSD</span>
      </div>
      <div className={styles.receipt}>
        <div className={styles.receiptRow}>
          <span className={styles.receiptLine} />
          <span className={styles.receiptAmount} />
        </div>
        <div className={styles.receiptRow}>
          <span className={styles.receiptLine} style={{ width: "40%" }} />
          <span className={styles.receiptAmount} />
        </div>
        <div className={styles.receiptRow}>
          <span className={styles.receiptTotal}>Total</span>
          <span className={styles.receiptTotalAmount}>₦18,500</span>
        </div>
      </div>
    </div>
  );
}

const VISUALS: Record<string, () => React.ReactElement> = {
  storefront: StorefrontVisual,
  catalog: CatalogVisual,
  orders: OrdersVisual,
  payments: PaymentsVisual,
};

export function SolutionsStorefrontModulePreview({ moduleId }: { moduleId: string }) {
  const Visual = VISUALS[moduleId];
  if (!Visual) return null;
  return (
    <div className={styles.visual}>
      <Visual />
    </div>
  );
}
