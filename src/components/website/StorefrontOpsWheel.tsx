import type { CSSProperties, ReactNode } from "react";
import styles from "./StorefrontOpsWheel.module.css";

type Tint = "navy" | "teal";

type Segment = {
  key: string;
  tint: Tint;
  rotDeg: number;
  path: string;
  icon: ReactNode;
  label: ReactNode;
  descTitle: ReactNode;
  descText: string;
};

/** CSS custom properties aren't part of React's CSSProperties type, so widen it locally */
type CSSVars = CSSProperties & Record<`--${string}`, string | number>;

const SEGMENTS: Segment[] = [
  {
    key: "storefront",
    tint: "navy",
    rotDeg: 0,
    path: "M 277.43 126.18 A 300 300 0 0 1 522.57 126.18 L 465.37 253.96 A 160 160 0 0 0 334.63 253.96 Z",
    icon: (
      <>
        <path d="M4 9V4h16v5" />
        <path d="M4 9a2 2 0 004 0 2 2 0 004 0 2 2 0 004 0 2 2 0 004 0" />
        <path d="M5 9v10a1 1 0 001 1h12a1 1 0 001-1V9" />
        <path d="M10 20v-5h4v5" />
      </>
    ),
    label: (
      <>
        Storefront &<br />
        Website
      </>
    ),
    descTitle: (
      <>
        Storefront &<br />
        Website
      </>
    ),
    descText:
      "A ready-to-use storefront on your own subdomain — your logo, your colours, your identity.",
  },
  {
    key: "catalog",
    tint: "teal",
    rotDeg: 51.43,
    path: "M 537.66 133.45 A 300 300 0 0 1 690.5 325.1 L 554.93 360.06 A 160 160 0 0 0 473.42 257.84 Z",
    icon: (
      <>
        <path d="M3 8l9-5 9 5-9 5-9-5z" />
        <path d="M3 8v9l9 5 9-5V8" />
        <path d="M12 13v9" />
      </>
    ),
    label: (
      <>
        Catalog &<br />
        Inventory
      </>
    ),
    descTitle: (
      <>
        Catalog &<br />
        Inventory
      </>
    ),
    descText:
      "Variants, pricing and stock tied together, with bulk tools for large catalogues.",
  },
  {
    key: "orders",
    tint: "navy",
    rotDeg: 102.86,
    path: "M 694.23 341.44 A 300 300 0 0 1 639.68 580.43 L 527.83 496.23 A 160 160 0 0 0 556.92 368.77 Z",
    icon: (
      <>
        <path d="M3 7h11v9H3z" />
        <path d="M14 10h4l3 3v3h-7z" />
        <circle cx="7" cy="18" r="1.6" fill="#fff" stroke="none" />
        <circle cx="17" cy="18" r="1.6" fill="#fff" stroke="none" />
      </>
    ),
    label: (
      <>
        Orders &<br />
        Fulfilment
      </>
    ),
    descTitle: (
      <>
        Orders &<br />
        Fulfilment
      </>
    ),
    descText:
      "End-to-end order management from placement through fulfilment and delivery.",
  },
  {
    key: "payments",
    tint: "teal",
    rotDeg: 154.29,
    path: "M 629.24 593.52 A 300 300 0 0 1 408.38 699.88 L 404.47 559.94 A 160 160 0 0 0 522.26 503.21 Z",
    icon: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
        <circle cx="17" cy="14.5" r="1.4" fill="#fff" stroke="none" />
      </>
    ),
    label: (
      <>
        Payments &<br />
        Checkout
      </>
    ),
    descTitle: (
      <>
        Payments &<br />
        Checkout
      </>
    ),
    descText:
      "Paystack-ready checkout — card, transfer and USSD, with room to add more.",
  },
  {
    key: "marketing",
    tint: "navy",
    rotDeg: 205.71,
    path: "M 391.62 699.88 A 300 300 0 0 1 170.76 593.52 L 277.74 503.21 A 160 160 0 0 0 395.53 559.94 Z",
    icon: (
      <>
        <path d="M3 17l5-5 4 4 8-9" />
        <path d="M15 6h5v5" />
      </>
    ),
    label: (
      <>
        Marketing &<br />
        Growth
      </>
    ),
    descTitle: (
      <>
        Marketing &<br />
        Growth
      </>
    ),
    descText:
      "SEO, discount codes and email campaigns — built in, not bolted on.",
  },
  {
    key: "team",
    tint: "teal",
    rotDeg: 257.14,
    path: "M 160.32 580.43 A 300 300 0 0 1 105.77 341.44 L 243.08 368.77 A 160 160 0 0 0 272.17 496.23 Z",
    icon: (
      <>
        <circle cx="12" cy="7.5" r="3" />
        <circle cx="4.5" cy="9.5" r="2.4" />
        <circle cx="19.5" cy="9.5" r="2.4" />
        <path d="M1.5 20c0-3 1.9-5.1 4.7-5.5M22.5 20c0-3-1.9-5.1-4.7-5.5M6.7 20c0-3.3 2.3-6 5.3-6s5.3 2.7 5.3 6" />
      </>
    ),
    label: (
      <>
        Team &<br />
        Access
      </>
    ),
    descTitle: (
      <>
        Team &<br />
        Access
      </>
    ),
    descText:
      "Staff invites and role-based access, so scaling up doesn't mean handing out admin keys.",
  },
  {
    key: "analytics",
    tint: "navy",
    rotDeg: 308.57,
    path: "M 109.5 325.1 A 300 300 0 0 1 262.34 133.45 L 326.58 257.84 A 160 160 0 0 0 245.07 360.06 Z",
    icon: (
      <>
        <path d="M5 20V12" />
        <path d="M12 20V6" />
        <path d="M19 20v-9" />
      </>
    ),
    label: (
      <>
        Analytics &<br />
        Reporting
      </>
    ),
    descTitle: (
      <>
        Analytics &<br />
        Reporting
      </>
    ),
    descText:
      "Sales, orders and traffic insights scoped to your storefront alone.",
  },
];

/** Interactive storefront-ops wheel: hover a wedge, its icon/badge or its outer badge to explore the module. */
export function StorefrontOpsWheel() {
  return (
    <div className={styles.viewport}>
      <div className={styles.canvasScale}>
        <div className={styles.stage}>
          <div className={styles.glow} />
          <div className={styles.wheel}>
            <div className={styles.spin}>
              <svg className={styles.donut} viewBox="0 0 800 800">
                {SEGMENTS.map((seg, i) => (
                  <g key={seg.key} className={`${styles.segGroup} ${styles[`s${i}`]}`}>
                    <path className={styles.glassBase} d={seg.path} />
                    <path className={`${styles.glassTint} ${styles[seg.tint]}`} d={seg.path} />
                  </g>
                ))}
                {SEGMENTS.map((seg, i) => (
                  <path
                    key={seg.key}
                    className={`${styles.hit} ${styles.hoverable} ${styles[`t${i}`]}`}
                    d={seg.path}
                  />
                ))}
              </svg>

              {SEGMENTS.map((seg, i) => (
                <div
                  key={seg.key}
                  className={`${styles.radial} ${styles.labelRadial} ${styles[`rl${i}`]}`}
                  style={{ "--rot": `${seg.rotDeg}deg` } as CSSVars}
                >
                  <div
                    className={`${styles.labelWrap} ${styles[`t${i}`]}`}
                    style={{ "--base": `${-seg.rotDeg}deg` } as CSSVars}
                  >
                    <svg className={styles.ic} viewBox="0 0 24 24">
                      {seg.icon}
                    </svg>
                    <span>{seg.label}</span>
                  </div>
                </div>
              ))}

              {SEGMENTS.map((seg, i) => (
                <div
                  key={seg.key}
                  className={styles.radial}
                  style={{ "--rot": `${seg.rotDeg}deg` } as CSSVars}
                >
                  <div className={`${styles.connector} ${styles[`c${i}`]}`} />
                  <div
                    className={`${styles.badge} ${styles.hoverable} ${styles[seg.tint]} ${styles[`t${i}`]}`}
                    style={{ "--i": i, "--brot": `${-seg.rotDeg}deg` } as CSSVars}
                  >
                    <svg className={styles.ic} viewBox="0 0 24 24">
                      {seg.icon}
                    </svg>
                  </div>
                </div>
              ))}
            </div>

            <div className={styles.hub}>
              <div className={styles.hint}>Hover a section to learn more</div>
              {SEGMENTS.map((seg, i) => (
                <div key={seg.key} className={`${styles.desc} ${styles[`desc${i}`]}`}>
                  <h4>{seg.descTitle}</h4>
                  <p>{seg.descText}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
