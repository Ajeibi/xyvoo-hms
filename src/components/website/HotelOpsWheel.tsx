import type { CSSProperties, ReactNode } from "react";
import styles from "./HotelOpsWheel.module.css";

type Tint = "navy" | "teal";

type Segment = {
  key: string;
  tint: Tint;
  rotDeg: number;
  /** Wedge outline — reused for the glass base, glass tint and invisible hit region */
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
    key: "housekeeping",
    tint: "navy",
    rotDeg: 0,
    path: "M 329.54 122.82 A 14 14 0 0 1 339.73 106.12 A 300 300 0 0 1 460.27 106.12 A 14 14 0 0 1 470.46 122.82 L 442.87 231.36 A 14 14 0 0 1 425.72 242.08 A 160 160 0 0 0 374.28 242.08 A 14 14 0 0 1 357.13 231.36 Z",
    icon: (
      <>
        <rect x="3" y="14" width="18" height="5" rx="1" />
        <rect x="3" y="9" width="8" height="5" rx="1.5" />
        <path d="M3 14V6" />
        <path d="M4 19v2M20 19v2" />
      </>
    ),
    label: "Housekeeping",
    descTitle: "Housekeeping",
    descText:
      "Room turnaround, cleaning schedules and inventory that keep every room spotless and guest-ready.",
  },
  {
    key: "guest-experience",
    tint: "teal",
    rotDeg: 32.73,
    path: "M 490.59 128.73 A 14 14 0 0 1 508.20 120.19 A 300 300 0 0 1 609.60 185.36 A 14 14 0 0 1 609.14 204.92 L 527.24 281.32 A 14 14 0 0 1 507.02 281.06 A 160 160 0 0 0 463.75 253.25 A 14 14 0 0 1 455.12 234.96 Z",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="12" rx="3" />
        <path d="M9 16l3 4 3-4" />
        <circle cx="8.5" cy="10" r="1" fill="#fff" stroke="none" />
        <circle cx="12" cy="10" r="1" fill="#fff" stroke="none" />
        <circle cx="15.5" cy="10" r="1" fill="#fff" stroke="none" />
      </>
    ),
    label: "Guest Experience",
    descTitle: "Guest Experience",
    descText:
      "Feedback, requests and the personal touches that shape how a guest feels about their stay.",
  },
  {
    key: "food-beverage",
    tint: "teal",
    rotDeg: 65.45,
    path: "M 622.85 220.74 A 14 14 0 0 1 642.28 223.08 A 300 300 0 0 1 692.36 332.71 A 14 14 0 0 1 681.40 348.93 L 571.20 368.93 A 14 14 0 0 1 554.33 357.78 A 160 160 0 0 0 532.96 310.99 A 14 14 0 0 1 535.58 290.94 Z",
    icon: (
      <>
        <path d="M6.5 2v5M8 2v6M9.5 2v5M8 8v14" />
        <path d="M16 2c1.4 0 2 1.6 2 3.5S17.4 10 16 10M16 2v18" />
      </>
    ),
    label: "Food & Beverage",
    descTitle: "Food & Beverage",
    descText:
      "Restaurants, bars and in-room dining — from menus and stock to service on the floor.",
  },
  {
    key: "finance",
    tint: "teal",
    rotDeg: 98.18,
    path: "M 684.39 369.69 A 14 14 0 0 1 699.47 382.16 A 300 300 0 0 1 682.32 501.47 A 14 14 0 0 1 664.34 509.18 L 560.82 466.43 A 14 14 0 0 1 552.65 447.92 A 160 160 0 0 0 559.97 397.01 A 14 14 0 0 1 573.02 381.56 Z",
    icon: (
      <>
        <rect x="3" y="6" width="18" height="13" rx="2" />
        <path d="M3 10h18" />
        <circle cx="17" cy="14.5" r="1.4" fill="#fff" stroke="none" />
      </>
    ),
    label: "Finance",
    descTitle: "Finance",
    descText:
      "Revenue, expenses and invoicing — the numbers that keep the property financially healthy.",
  },
  {
    key: "reservations-booking",
    tint: "teal",
    rotDeg: 130.91,
    path: "M 655.62 528.27 A 14 14 0 0 1 661.57 546.91 A 300 300 0 0 1 582.63 638.00 A 14 14 0 0 1 563.34 634.77 L 499.37 542.83 A 14 14 0 0 1 502.50 522.85 A 160 160 0 0 0 536.19 483.98 A 14 14 0 0 1 555.52 478.04 Z",
    icon: (
      <>
        <rect x="3" y="5" width="18" height="16" rx="2" />
        <path d="M8 3v4M16 3v4M3 10h18" />
        <circle cx="8" cy="15" r="1" fill="#fff" stroke="none" />
        <circle cx="12" cy="15" r="1" fill="#fff" stroke="none" />
        <circle cx="16" cy="15" r="1" fill="#fff" stroke="none" />
      </>
    ),
    label: (
      <>
        Reservations &<br />
        Booking Engine
      </>
    ),
    descTitle: (
      <>
        Reservations &<br />
        Booking Engine
      </>
    ),
    descText:
      "Room availability, rates and the booking flow guests use to reserve their stay.",
  },
  {
    key: "maintenance-engineering",
    tint: "navy",
    rotDeg: 163.64,
    path: "M 545.68 646.11 A 14 14 0 0 1 540.61 665.01 A 300 300 0 0 1 424.95 698.96 A 14 14 0 0 1 410.47 685.81 L 406.37 573.88 A 14 14 0 0 1 419.81 558.77 A 160 160 0 0 0 469.16 544.28 A 14 14 0 0 1 488.63 549.73 Z",
    icon: <path d="M14.7 6.3a4 4 0 00-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 005.4-5.4l-2.1 2.1-2.6-2.6z" />,
    label: (
      <>
        Maintenance &<br />
        Engineering
      </>
    ),
    descTitle: (
      <>
        Maintenance &<br />
        Engineering
      </>
    ),
    descText:
      "Preventive upkeep and repairs that keep facilities safe, comfortable and running smoothly.",
  },
  {
    key: "sales-banquets",
    tint: "navy",
    rotDeg: 196.36,
    path: "M 389.53 685.81 A 14 14 0 0 1 375.05 698.96 A 300 300 0 0 1 259.39 665.01 A 14 14 0 0 1 254.32 646.11 L 311.37 549.73 A 14 14 0 0 1 330.84 544.28 A 160 160 0 0 0 380.19 558.77 A 14 14 0 0 1 393.63 573.88 Z",
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
        Sales & Banquets
        <br />
        (Events/MICE)
      </>
    ),
    descTitle: (
      <>
        Sales & Banquets
        <br />
        (Events/MICE)
      </>
    ),
    descText:
      "Conferences, weddings and group events — managed from first enquiry to final execution.",
  },
  {
    key: "crm-loyalty",
    tint: "navy",
    rotDeg: 229.09,
    path: "M 236.66 634.77 A 14 14 0 0 1 217.37 638.00 A 300 300 0 0 1 138.43 546.91 A 14 14 0 0 1 144.38 528.27 L 244.48 478.04 A 14 14 0 0 1 263.81 483.98 A 160 160 0 0 0 297.50 522.85 A 14 14 0 0 1 300.63 542.83 Z",
    icon: <path d="M12 3l2.47 5.11 5.53.8-4 3.98.94 5.61L12 15.9l-4.94 2.6.94-5.61-4-3.98 5.53-.8z" />,
    label: "CRM & Loyalty",
    descTitle: "CRM & Loyalty",
    descText:
      "Guest profiles, rewards and repeat-stay programmes that turn visitors into regulars.",
  },
  {
    key: "rate-revenue",
    tint: "navy",
    rotDeg: 261.82,
    path: "M 135.66 509.18 A 14 14 0 0 1 117.68 501.47 A 300 300 0 0 1 100.53 382.16 A 14 14 0 0 1 115.61 369.69 L 226.98 381.56 A 14 14 0 0 1 240.03 397.01 A 160 160 0 0 0 247.35 447.92 A 14 14 0 0 1 239.18 466.43 Z",
    icon: (
      <>
        <path d="M3 17l5-5 4 4 8-9" />
        <path d="M15 6h5v5" />
      </>
    ),
    label: (
      <>
        Rate & Revenue
        <br />
        Management
      </>
    ),
    descTitle: (
      <>
        Rate & Revenue
        <br />
        Management
      </>
    ),
    descText:
      "Dynamic pricing and demand forecasting to get the most value from every room, every night.",
  },
  {
    key: "channel-management",
    tint: "navy",
    rotDeg: 294.55,
    path: "M 118.60 348.93 A 14 14 0 0 1 107.64 332.71 A 300 300 0 0 1 157.72 223.08 A 14 14 0 0 1 177.15 220.74 L 264.42 290.94 A 14 14 0 0 1 267.04 310.99 A 160 160 0 0 0 245.67 357.78 A 14 14 0 0 1 228.80 368.93 Z",
    icon: (
      <>
        <path d="M3 12a9 9 0 0115.3-6.36" />
        <path d="M21 5v5h-5" />
        <path d="M21 12a9 9 0 01-15.3 6.36" />
        <path d="M3 19v-5h5" />
      </>
    ),
    label: "Channel Management",
    descTitle: "Channel Management",
    descText: "Keeping rates and availability in sync across every OTA and booking channel.",
  },
  {
    key: "front-desk",
    tint: "navy",
    rotDeg: 327.27,
    path: "M 190.86 204.92 A 14 14 0 0 1 190.40 185.36 A 300 300 0 0 1 291.80 120.19 A 14 14 0 0 1 309.41 128.73 L 344.88 234.96 A 14 14 0 0 1 336.25 253.25 A 160 160 0 0 0 292.98 281.06 A 14 14 0 0 1 272.76 281.32 Z",
    icon: (
      <>
        <path d="M12 3a5 5 0 00-5 5v3.5c0 .9-.36 1.76-1 2.4L4.5 16h15l-1.5-2.1a3.4 3.4 0 01-1-2.4V8a5 5 0 00-5-5z" />
        <path d="M9.5 19a2.5 2.5 0 005 0" />
      </>
    ),
    label: "Front Desk",
    descTitle: "Front Desk",
    descText: "Check-in, check-out and the first and last impression of every guest's visit.",
  },
];

/** Interactive hotel-ops wheel: hover a wedge, its icon/badge or its outer badge to explore the module. */
export function HotelOpsWheel() {
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
