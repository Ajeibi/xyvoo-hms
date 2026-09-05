"use client";

import { useState } from "react";
import {
  UserCheck,
  CalendarRange,
  ClipboardList,
  UsersRound,
  UtensilsCrossed,
  Flame,
  Receipt,
  Wrench,
  Package,
  TrendingUp,
  Activity,
  Radio,
  type LucideIcon,
} from "lucide-react";
import styles from "./OperationalTruthWheelMockup.module.css";

interface DepartmentNode {
  id: string;
  name: string;
  code: string;
  rotDeg: number;
  tint: "teal" | "blue" | "indigo";
  icon: LucideIcon;
  primaryMetric: string;
  primaryLabel: string;
  trend: string;
  detailLead: string;
  statA: { key: string; val: string };
  statB: { key: string; val: string };
  telemetryTag: string;
}

const DEPARTMENTS: DepartmentNode[] = [
  {
    id: "front-desk",
    name: "Front Desk",
    code: "01 / FRONT DESK",
    rotDeg: 0,
    tint: "teal",
    icon: UserCheck,
    primaryMetric: "98.5%",
    primaryLabel: "Checked In",
    trend: "+3.2%",
    detailLead: "42 of 44 arrivals cleared. Average check-in queue under 45s with keyless pre-registration.",
    statA: { key: "Avg Queue", val: "0.8 min" },
    statB: { key: "Express Check-in", val: "76%" },
    telemetryTag: "WebSocket Event Stream",
  },
  {
    id: "crs",
    name: "Reservations",
    code: "02 / CENTRAL CRS",
    rotDeg: 36,
    tint: "blue",
    icon: CalendarRange,
    primaryMetric: "78.4%",
    primaryLabel: "Occupancy",
    trend: "+5.1%",
    detailLead: "118 booked out of 150 keys. Direct website engine driving 64% of total booking pace.",
    statA: { key: "ADR Average", val: "$214.50" },
    statB: { key: "Direct Share", val: "64.2%" },
    telemetryTag: "2-Way OTA & Direct Sync",
  },
  {
    id: "housekeeping",
    name: "Housekeeping",
    code: "03 / HOUSEKEEPING",
    rotDeg: 72,
    tint: "teal",
    icon: ClipboardList,
    primaryMetric: "94.0%",
    primaryLabel: "Rooms Ready",
    trend: "+12%",
    detailLead: "141 clean rooms inspected. Turnaround time down to 18 mins via automated room dispatch.",
    statA: { key: "Avg Clean Time", val: "18.2 min" },
    statB: { key: "In Turnaround", val: "6 Rooms" },
    telemetryTag: "Mobile PWA Auto-Dispatch",
  },
  {
    id: "hr",
    name: "Workforce & HR",
    code: "04 / ROSTERS & HR",
    rotDeg: 108,
    tint: "indigo",
    icon: UsersRound,
    primaryMetric: "100%",
    primaryLabel: "Shifts Covered",
    trend: "Nominal",
    detailLead: "32 on-duty staff synced across 4 operational shifts with automated biometric time tracking.",
    statA: { key: "On-Duty Staff", val: "32 Active" },
    statB: { key: "Overtime Risk", val: "0 Hours" },
    telemetryTag: "Live Biometric & Shift Sync",
  },
  {
    id: "fb-pos",
    name: "F&B POS",
    code: "05 / F&B SERVICE",
    rotDeg: 144,
    tint: "teal",
    icon: UtensilsCrossed,
    primaryMetric: "$4,820",
    primaryLabel: "F&B Sales",
    trend: "+18.4%",
    detailLead: "164 dining & bar checks closed today. Tableside mobile ordering active on terrace and pool.",
    statA: { key: "Avg Ticket", val: "$29.40" },
    statB: { key: "Tables Turn", val: "3.4x" },
    telemetryTag: "POS Instant Socket Feed",
  },
  {
    id: "kitchen",
    name: "Kitchen KDS",
    code: "06 / CULINARY KDS",
    rotDeg: 180,
    tint: "blue",
    icon: Flame,
    primaryMetric: "12.4m",
    primaryLabel: "Avg Prep Time",
    trend: "-2.1m",
    detailLead: "18 active order tickets routed across Grill, Cold Larder, and Barista prep lines.",
    statA: { key: "Active Tickets", val: "18 Orders" },
    statB: { key: "SLA Delays", val: "0 Orders" },
    telemetryTag: "KDS Multi-Station Bus",
  },
  {
    id: "billing",
    name: "Folio & Billing",
    code: "07 / FOLIO FINANCE",
    rotDeg: 216,
    tint: "indigo",
    icon: Receipt,
    primaryMetric: "$18,450",
    primaryLabel: "Settled Today",
    trend: "+8.2%",
    detailLead: "100% of guest folios balanced upon departure. Automated double-entry journals posted to GL.",
    statA: { key: "Split Folios", val: "28 Processed" },
    statB: { key: "Unallocated", val: "$0.00" },
    telemetryTag: "Automated Double-Entry GL",
  },
  {
    id: "cmms",
    name: "Maintenance",
    code: "08 / CMMS UPKEEP",
    rotDeg: 252,
    tint: "teal",
    icon: Wrench,
    primaryMetric: "0 Faults",
    primaryLabel: "Urgent Orders",
    trend: "100% Up",
    detailLead: "Zero critical maintenance faults. 4 preventive maintenance checks verified across HVAC & lifts.",
    statA: { key: "HVAC Uptime", val: "100.0%" },
    statB: { key: "Completed PMs", val: "4 Assets" },
    telemetryTag: "IoT & Asset Registry Bus",
  },
  {
    id: "procurement",
    name: "Procurement",
    code: "09 / INVENTORY",
    rotDeg: 288,
    tint: "blue",
    icon: Package,
    primaryMetric: "99.4%",
    primaryLabel: "Par Levels",
    trend: "Armed",
    detailLead: "Automated par-level reordering active. 2 supplier purchase orders in transit with verified PO.",
    statA: { key: "Stock Health", val: "99.4%" },
    statB: { key: "POs In Transit", val: "2 Orders" },
    telemetryTag: "PO Approval & Par Stream",
  },
  {
    id: "revenue",
    name: "Revenue & Yield",
    code: "10 / REVPAR YIELD",
    rotDeg: 324,
    tint: "indigo",
    icon: TrendingUp,
    primaryMetric: "$168.40",
    primaryLabel: "RevPAR",
    trend: "+14.2%",
    detailLead: "Dynamic algorithmic yield rules adjusting room rates in real time based on city occupancy surge.",
    statA: { key: "YoY Growth", val: "+14.2%" },
    statB: { key: "Algorithm", val: "Surge Yield" },
    telemetryTag: "OLAP Yield Engine Core",
  },
];

export function OperationalTruthWheelMockup() {
  const [hoveredDeptId, setHoveredDeptId] = useState<string | null>(null);
  const [lockedDeptId, setLockedDeptId] = useState<string | null>(null);

  const activeDeptId = hoveredDeptId ?? lockedDeptId;
  const activeDept = DEPARTMENTS.find((d) => d.id === activeDeptId) ?? null;

  const handleNodeClick = (deptId: string) => {
    if (lockedDeptId === deptId) {
      setLockedDeptId(null);
    } else {
      setLockedDeptId(deptId);
    }
  };

  return (
    <div className={`${styles.viewport} ${lockedDeptId ? styles.paused : ""}`}>
      {/* Ambient circular backdrop lighting */}
      <div className={styles.ambientGlow} />

      {/* Interactive Orbital Wheel Stage */}
      <div className={styles.canvasScale}>
        <div className={styles.stage}>
          {/* Background Concentric Radar Rings */}
          <svg className={styles.radarSvg} viewBox="0 0 640 640">
            <defs>
              <radialGradient id="hubGlowCore" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#20a8ab" stopOpacity="0.3" />
                <stop offset="60%" stopColor="#3b82f6" stopOpacity="0.12" />
                <stop offset="100%" stopColor="transparent" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* Ambient concentric track rings */}
            <circle cx="320" cy="320" r="280" fill="none" stroke="rgba(15, 35, 70, 0.12)" strokeWidth="1" strokeDasharray="4 6" />
            <circle cx="320" cy="320" r="218" fill="none" stroke="rgba(32, 168, 171, 0.35)" strokeWidth="1.2" />
            <circle cx="320" cy="320" r="140" fill="none" stroke="rgba(15, 35, 70, 0.14)" strokeWidth="1" strokeDasharray="3 4" />
            <circle cx="320" cy="320" r="115" fill="url(#hubGlowCore)" />
          </svg>

          {/* Rotating Turntable containing all 10 Department Nodes & Spoke Lines */}
          <div className={styles.turntable}>
            {DEPARTMENTS.map((dept) => {
              const isSelected = dept.id === activeDeptId;
              const IconComponent = dept.icon;

              return (
                <div
                  key={dept.id}
                  className={styles.nodeRadial}
                  style={
                    {
                      "--rot": `${dept.rotDeg}deg`,
                    } as React.CSSProperties
                  }
                >
                  {/* Spoke line physically attached to this radial spoke — rotates in lockstep with the node */}
                  <div className={`${styles.spokeLine} ${isSelected ? styles.spokeLineActive : ""}`} />

                  {/* Node wrapper with counter-spin so card stays upright while in orbit */}
                  <div
                    className={styles.nodeWrap}
                    style={
                      {
                        "--baseRot": `${-dept.rotDeg}deg`,
                      } as React.CSSProperties
                    }
                    onMouseEnter={() => setHoveredDeptId(dept.id)}
                    onMouseLeave={() => setHoveredDeptId(null)}
                    onClick={() => handleNodeClick(dept.id)}
                  >
                    <div className={`${styles.nodeCard} ${isSelected ? styles.nodeCardActive : ""}`}>
                      <div
                        className={`${styles.nodeIconBox} ${
                          dept.tint === "teal"
                            ? styles.nodeIconBoxTeal
                            : dept.tint === "blue"
                            ? styles.nodeIconBoxBlue
                            : styles.nodeIconBoxIndigo
                        }`}
                      >
                        <IconComponent className="h-3.5 w-3.5" />
                      </div>

                      <div className={styles.nodeInfo}>
                        <span className={styles.nodeDept}>{dept.name}</span>
                        <div className={styles.nodeMetric}>
                          <span>{dept.primaryMetric}</span>
                          <span className={styles.metricUp}>{dept.trend}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Fixed Central Intelligence Hub (never rotates) */}
          <div
            className={styles.centerHub}
            onClick={() => {
              if (lockedDeptId) setLockedDeptId(null);
            }}
          >
            <div className={styles.hubRing} />

            <div className={styles.hubInner}>
              {activeDept ? (
                /* Inspected Department Detail State */
                <>
                  <div className={styles.inspectHeader}>
                    <div className={styles.inspectIconBadge}>
                      <activeDept.icon className="h-3 w-3" />
                    </div>
                    <span className={styles.inspectDeptName}>{activeDept.name}</span>
                  </div>

                  <div className={styles.inspectBigVal}>{activeDept.primaryMetric}</div>

                  <p className={styles.inspectDesc}>{activeDept.detailLead}</p>

                  <div className={styles.idleStatsGrid}>
                    <div className={styles.idleStatBox}>
                      <span className={styles.idleStatVal}>{activeDept.statA.val}</span>
                      <span className={styles.idleStatKey}>{activeDept.statA.key}</span>
                    </div>
                    <div className={styles.idleStatBox}>
                      <span className={styles.idleStatVal}>{activeDept.statB.val}</span>
                      <span className={styles.idleStatKey}>{activeDept.statB.key}</span>
                    </div>
                  </div>

                  <div className={styles.inspectPillRow}>
                    <Radio className="h-2.5 w-2.5 animate-pulse text-teal-300" />
                    <span>{activeDept.telemetryTag}</span>
                  </div>
                </>
              ) : (
                /* Idle Core Property Pulse State */
                <>
                  <div className={styles.idleTitle}>
                    <Activity className="h-3 w-3 animate-pulse text-teal-400" />
                    <span>Property Pulse</span>
                  </div>

                  <div className={styles.idleMetricBig}>$18,450</div>
                  <div className={styles.idleSubLabel}>Total Gross Revenue Today</div>

                  <div className={styles.idleStatsGrid}>
                    <div className={styles.idleStatBox}>
                      <span className={styles.idleStatVal}>$168.40</span>
                      <span className={styles.idleStatKey}>RevPAR Yield</span>
                    </div>
                    <div className={styles.idleStatBox}>
                      <span className={styles.idleStatVal}>78.4%</span>
                      <span className={styles.idleStatKey}>Occupancy</span>
                    </div>
                  </div>

                  <div className={styles.idleHint}>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400" />
                    <span>Hover any department to inspect</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
