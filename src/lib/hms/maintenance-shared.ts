/** Browser-safe types and plain rules for Maintenance. No server imports here. */

export const WO_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type WoPriority = (typeof WO_PRIORITIES)[number];

export const WO_STATUSES = ["open", "assigned", "in_progress", "on_hold", "completed", "cancelled"] as const;
export type WoStatus = (typeof WO_STATUSES)[number];

export const WO_SOURCES = ["staff", "housekeeping", "front_desk", "guest", "planned", "api"] as const;
export type WoSource = (typeof WO_SOURCES)[number];

export const OPEN_STATUSES: WoStatus[] = ["open", "assigned", "in_progress", "on_hold"];

export const PRIORITY_LABEL: Record<WoPriority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };
export const STATUS_LABEL: Record<WoStatus, string> = {
  open: "Open",
  assigned: "Assigned",
  in_progress: "In progress",
  on_hold: "On hold",
  completed: "Completed",
  cancelled: "Cancelled",
};
export const SOURCE_LABEL: Record<WoSource, string> = {
  staff: "Staff",
  housekeeping: "Housekeeping",
  front_desk: "Front desk",
  guest: "Guest",
  planned: "Planned maintenance",
  api: "Other system",
};

/** Used when a hotel has not set up its own categories yet. */
export const DEFAULT_CATEGORIES: { name: string; priority: WoPriority }[] = [
  { name: "Plumbing", priority: "high" },
  { name: "Electrical", priority: "high" },
  { name: "Air conditioning", priority: "high" },
  { name: "Furniture and fittings", priority: "normal" },
  { name: "Appliances and TV", priority: "normal" },
  { name: "Doors and locks", priority: "high" },
  { name: "Painting and walls", priority: "low" },
  { name: "Generator and power", priority: "urgent" },
  { name: "Lift", priority: "urgent" },
  { name: "Other", priority: "normal" },
];

export type MaintenanceSettings = {
  slaUrgentHours: number;
  slaHighHours: number;
  slaNormalHours: number;
  slaLowHours: number;
  repeatFaultThreshold: number;
};

export const DEFAULT_SETTINGS: MaintenanceSettings = {
  slaUrgentHours: 2,
  slaHighHours: 8,
  slaNormalHours: 48,
  slaLowHours: 168,
  repeatFaultThreshold: 3,
};

export function slaHoursFor(settings: MaintenanceSettings, priority: WoPriority): number {
  switch (priority) {
    case "urgent":
      return settings.slaUrgentHours;
    case "high":
      return settings.slaHighHours;
    case "low":
      return settings.slaLowHours;
    default:
      return settings.slaNormalHours;
  }
}

export function slaDueAt(createdAt: Date, settings: MaintenanceSettings, priority: WoPriority): Date {
  return new Date(createdAt.getTime() + slaHoursFor(settings, priority) * 3600000);
}

export function isOpenStatus(status: WoStatus): boolean {
  return OPEN_STATUSES.includes(status);
}

/** Overdue: still open (and not on hold) past its due time. */
export function isOverdue(wo: { status: WoStatus; slaDueAt: string | null }, now: Date = new Date()): boolean {
  if (!wo.slaDueAt || !isOpenStatus(wo.status) || wo.status === "on_hold") return false;
  return new Date(wo.slaDueAt).getTime() < now.getTime();
}

/** "2h 10m late" / "due in 3h" / "due in 2 days". */
export function describeDue(slaDue: string | null, now: Date = new Date()): string {
  if (!slaDue) return "No target time";
  const diffMin = Math.round((new Date(slaDue).getTime() - now.getTime()) / 60000);
  const abs = Math.abs(diffMin);
  const text =
    abs < 60 ? `${abs}m` : abs < 48 * 60 ? `${Math.floor(abs / 60)}h${abs % 60 ? ` ${abs % 60}m` : ""}` : `${Math.round(abs / 1440)} days`;
  return diffMin < 0 ? `${text} late` : `due in ${text}`;
}

/** The allowed next statuses from each status. Completed and cancelled orders can be reopened. */
export const STATUS_FLOW: Record<WoStatus, WoStatus[]> = {
  open: ["assigned", "in_progress", "on_hold", "completed", "cancelled"],
  assigned: ["open", "in_progress", "on_hold", "completed", "cancelled"],
  in_progress: ["assigned", "on_hold", "completed", "cancelled"],
  on_hold: ["open", "assigned", "in_progress", "cancelled"],
  completed: ["open"],
  cancelled: ["open"],
};

export function canMove(from: WoStatus, to: WoStatus): boolean {
  return STATUS_FLOW[from].includes(to);
}

export type WorkOrder = {
  id: string;
  woNumber: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: WoPriority;
  status: WoStatus;
  source: WoSource;
  roomUnitId: string | null;
  roomCode: string | null;
  locationText: string | null;
  assetId: string | null;
  assetName: string | null;
  scheduleId: string | null;
  technicianId: string | null;
  technicianName: string | null;
  reportedByName: string | null;
  slaDueAt: string | null;
  assignedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  holdReason: string | null;
  resolutionNotes: string | null;
  labourMinutes: number;
  partsCost: number;
  roomBlockId: string | null;
  tookRoomOutOfOrder: boolean;
  createdAt: string;
  updatedAt: string;
};

export type WorkOrderEvent = {
  id: string;
  kind: string;
  body: string | null;
  actorName: string | null;
  createdAt: string;
};

export type WorkOrderPart = {
  id: string;
  itemId: string | null;
  description: string;
  qty: number;
  unitCost: number;
  createdAt: string;
};

export type Technician = { id: string; name: string; phone: string | null; specialty: string | null; active: boolean };
export type CategoryRow = { id: string; name: string; defaultPriority: WoPriority; active: boolean };

export type AssetStatus = "in_service" | "out_of_service" | "retired";
export type MaintenanceAsset = {
  id: string;
  assetTag: string;
  name: string;
  category: string | null;
  roomUnitId: string | null;
  roomCode: string | null;
  locationText: string | null;
  make: string | null;
  model: string | null;
  serialNumber: string | null;
  installedOn: string | null;
  warrantyUntil: string | null;
  fixedAssetId: string | null;
  status: AssetStatus;
  notes: string | null;
};

export type ScheduleUnit = "day" | "week" | "month" | "year";
export type MaintenanceSchedule = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  priority: WoPriority;
  everyN: number;
  unit: ScheduleUnit;
  nextDue: string;
  leadDays: number;
  assetId: string | null;
  assetName: string | null;
  roomUnitId: string | null;
  roomCode: string | null;
  locationText: string | null;
  technicianId: string | null;
  technicianName: string | null;
  active: boolean;
  lastGeneratedOn: string | null;
};

/** Adds N days/weeks/months/years to a yyyy-mm-dd date, clamping the day for short months. */
export function addInterval(isoDate: string, everyN: number, unit: ScheduleUnit): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  if (unit === "day" || unit === "week") {
    const dt = new Date(Date.UTC(y, m - 1, d + everyN * (unit === "week" ? 7 : 1)));
    return dt.toISOString().slice(0, 10);
  }
  const monthsToAdd = unit === "year" ? everyN * 12 : everyN;
  const total = m - 1 + monthsToAdd;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return new Date(Date.UTC(ny, nm, Math.min(d, lastDay))).toISOString().slice(0, 10);
}

export function describeInterval(everyN: number, unit: ScheduleUnit): string {
  return everyN === 1 ? `Every ${unit}` : `Every ${everyN} ${unit}s`;
}

export function whereOf(wo: Pick<WorkOrder, "roomCode" | "locationText" | "assetName">): string {
  const parts = [wo.roomCode ? `Room ${wo.roomCode}` : null, wo.locationText, wo.assetName].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No location";
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function formatMinutes(mins: number): string {
  if (!mins) return "0m";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h}h${m ? ` ${m}m` : ""}` : `${m}m`;
}

export function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
