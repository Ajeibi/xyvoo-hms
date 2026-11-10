/* Browser-safe HR types, labels and rules (no database, no server imports). */

export const EMPLOYMENT_TYPES = ["full_time", "part_time", "casual", "contract", "intern"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];
export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  casual: "Casual",
  contract: "Contract",
  intern: "Intern",
};

export const EMPLOYEE_STATUSES = ["active", "suspended", "left"] as const;
export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];
export const EMPLOYEE_STATUS_LABEL: Record<EmployeeStatus, string> = { active: "Active", suspended: "Suspended", left: "Left" };

export const PAY_BASES = ["monthly", "hourly", "daily"] as const;
export type PayBasis = (typeof PAY_BASES)[number];

export const DOCUMENT_KINDS = ["Employment contract", "ID (NIN slip or passport)", "Guarantor form", "Medical certificate", "Food handler certificate", "Reference letter", "Other"] as const;

export type Employee = {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  fullName: string;
  jobTitle: string | null;
  department: string | null;
  employmentType: EmploymentType;
  startDate: string | null;
  endDate: string | null;
  leavingReason: string | null;
  status: EmployeeStatus;
  workEmail: string | null;
  workPhone: string | null;
  userId: string | null;
  contractedHoursWeek: number | null;
  hasPin: boolean;
  colour: string | null;
};

export type EmployeePrivate = {
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  homeAddress: string | null;
  stateOfResidence: string | null;
  personalPhone: string | null;
  personalEmail: string | null;
  nextOfKinName: string | null;
  nextOfKinRelationship: string | null;
  nextOfKinPhone: string | null;
  nin: string | null;
  tin: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;
  bankAccountName: string | null;
  pfaName: string | null;
  rsaPin: string | null;
  nhfNumber: string | null;
  guarantorName: string | null;
  guarantorPhone: string | null;
  notes: string | null;
};

export type PayProfile = {
  payBasis: PayBasis;
  basicMonthly: number;
  housingMonthly: number;
  transportMonthly: number;
  otherAllowancesMonthly: number;
  hourlyRate: number;
  dailyRate: number;
  annualRentPaid: number;
  otherReliefsAnnual: number;
  monthlyDeductions: number;
  monthlyDeductionsNote: string | null;
  pensionOptIn: boolean;
  nhfOptIn: boolean;
  payeExempt: boolean;
};

export const EMPTY_PAY_PROFILE: PayProfile = {
  payBasis: "monthly",
  basicMonthly: 0,
  housingMonthly: 0,
  transportMonthly: 0,
  otherAllowancesMonthly: 0,
  hourlyRate: 0,
  dailyRate: 0,
  annualRentPaid: 0,
  otherReliefsAnnual: 0,
  monthlyDeductions: 0,
  monthlyDeductionsNote: null,
  pensionOptIn: true,
  nhfOptIn: false,
  payeExempt: false,
};

export type EmployeeDocument = {
  id: string;
  employeeId: string;
  kind: string;
  reference: string | null;
  receivedOn: string | null;
  expiresOn: string | null;
  note: string | null;
  /** The uploaded scan's file name, if a file is held. */
  fileName?: string | null;
  hasFile?: boolean;
};

export type HrSettings = {
  departments: string[];
  weekStartsOn: number;
  minRestHours: number;
  maxWeeklyHours: number;
  lateGraceMinutes: number;
  overtimeAfterWeeklyHours: number;
  overtimeMultiplier: number;
  kioskEnabled: boolean;
  kioskSelfService: boolean;
  /** Take a photo with the tablet camera at each clock-in and clock-out. */
  kioskPhoto: boolean;
  hasKioskLink: boolean;
  pensionEnabled: boolean;
  nsitfEnabled: boolean;
  itfEnabled: boolean;
  payDay: number;
  expenseAccountCode: string;
  payeAccountCode: string;
  statutoryAccountCode: string;
  netPayAccountCode: string;
  bankAccountCode: string;
};

export type ShiftStatus = "draft" | "published" | "cancelled";
export type Shift = {
  id: string;
  employeeId: string | null;
  employeeName: string | null;
  department: string | null;
  position: string | null;
  shiftDate: string;
  startsAt: string;
  endsAt: string;
  breakMinutes: number;
  notes: string | null;
  status: ShiftStatus;
};

export type ShiftTemplate = {
  id: string;
  name: string;
  department: string | null;
  position: string | null;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  active: boolean;
};

export type SwapKind = "give_away" | "swap" | "pick_up";
export type SwapStatus = "pending" | "accepted" | "approved" | "declined" | "cancelled";
export const SWAP_KIND_LABEL: Record<SwapKind, string> = { give_away: "Give away", swap: "Swap", pick_up: "Pick up open shift" };
export const SWAP_STATUS_LABEL: Record<SwapStatus, string> = {
  pending: "Waiting for colleague",
  accepted: "Waiting for manager",
  approved: "Approved",
  declined: "Declined",
  cancelled: "Cancelled",
};
export type SwapRequest = {
  id: string;
  kind: SwapKind;
  status: SwapStatus;
  shift: Shift | null;
  otherShift: Shift | null;
  fromEmployeeId: string | null;
  fromName: string | null;
  toEmployeeId: string | null;
  toName: string | null;
  note: string | null;
  decisionNote: string | null;
  createdAt: string;
};

export type TimeEntry = {
  id: string;
  employeeId: string;
  employeeName: string;
  shiftId: string | null;
  clockIn: string;
  clockOut: string | null;
  breakMinutes: number;
  onBreak: boolean;
  source: "kiosk" | "manager";
  status: "pending" | "approved";
  editedReason: string | null;
  /** Minutes late against the linked shift (after the grace period), or null. */
  lateMinutes: number | null;
  /** Minutes left before the shift's end, or null. */
  leftEarlyMinutes: number | null;
  /** Clock screen photos: a storage path from the database, swapped for a link that expires before it reaches the browser. */
  clockInPhoto?: string | null;
  clockOutPhoto?: string | null;
};

export type LeaveType = {
  id: string;
  name: string;
  paid: boolean;
  daysPerYear: number;
  carryOverMax: number;
  countsAgainstBalance: boolean;
  active: boolean;
};

export type LeaveStatus = "pending" | "approved" | "declined" | "cancelled";
export const LEAVE_STATUS_LABEL: Record<LeaveStatus, string> = { pending: "Waiting", approved: "Approved", declined: "Declined", cancelled: "Cancelled" };
export type LeaveRequest = {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveTypeId: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  source: "hr" | "kiosk";
  decisionNote: string | null;
  createdAt: string;
};

/**
 * Defaults from the Labour Act (Cap L1 LFN 2004): annual holiday of at least 6 working days after
 * 12 months' service (s.18), up to 12 working days' paid sick leave a year (s.16), 12 weeks'
 * maternity leave (s.54). Paternity (14 working days) follows the federal public service rule
 * many private employers copy. Hotels change these in HR settings.
 */
export const DEFAULT_LEAVE_TYPES: Omit<LeaveType, "id" | "active">[] = [
  { name: "Annual leave", paid: true, daysPerYear: 15, carryOverMax: 5, countsAgainstBalance: true },
  { name: "Sick leave", paid: true, daysPerYear: 12, carryOverMax: 0, countsAgainstBalance: true },
  { name: "Maternity leave", paid: true, daysPerYear: 84, carryOverMax: 0, countsAgainstBalance: true },
  { name: "Paternity leave", paid: true, daysPerYear: 14, carryOverMax: 0, countsAgainstBalance: true },
  { name: "Compassionate leave", paid: true, daysPerYear: 5, carryOverMax: 0, countsAgainstBalance: true },
  { name: "Study leave", paid: false, daysPerYear: 10, carryOverMax: 0, countsAgainstBalance: true },
  { name: "Unpaid leave", paid: false, daysPerYear: 0, carryOverMax: 0, countsAgainstBalance: false },
];

/* ---------- small pure helpers ---------- */

export function fullNameOf(e: { firstName: string; lastName: string; preferredName?: string | null }) {
  return `${e.preferredName?.trim() || e.firstName} ${e.lastName}`.trim();
}

export const naira = (n: number) =>
  `₦${(Math.round(n * 100) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** The first day of the week holding `date`, for a week that starts on `weekStartsOn` (0 = Sunday). */
export function weekStart(date: string, weekStartsOn: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  const diff = (d.getUTCDay() - weekStartsOn + 7) % 7;
  return addDays(date, -diff);
}

export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Paid hours in a shift: length minus unpaid break. */
export function shiftHours(s: { startsAt: string; endsAt: string; breakMinutes: number }): number {
  const mins = (new Date(s.endsAt).getTime() - new Date(s.startsAt).getTime()) / 60000 - s.breakMinutes;
  return Math.max(0, Math.round((mins / 60) * 100) / 100);
}

export function entryHours(e: { clockIn: string; clockOut: string | null; breakMinutes: number }, now = Date.now()): number {
  const end = e.clockOut ? new Date(e.clockOut).getTime() : now;
  const mins = (end - new Date(e.clockIn).getTime()) / 60000 - e.breakMinutes;
  return Math.max(0, Math.round((mins / 60) * 100) / 100);
}

/** Working days (Monday to Friday) between two dates inclusive, less any listed public holidays. */
export function workingDaysBetween(start: string, end: string, holidays: string[] = []): number {
  if (end < start) return 0;
  const skip = new Set(holidays);
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const day = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (day !== 0 && day !== 6 && !skip.has(d)) n += 1;
  }
  return n;
}

export type ShiftWarning = { kind: "leave" | "rest" | "weekly_hours" | "inactive"; message: string };

/**
 * Checks a planned shift against the person's other shifts and leave. Double booking is blocked
 * by the database; these are the softer rules a manager should see before publishing.
 */
export function checkShift(params: {
  shift: { id?: string; startsAt: string; endsAt: string; breakMinutes: number; shiftDate: string };
  otherShifts: { id: string; startsAt: string; endsAt: string; breakMinutes: number; shiftDate: string; status: ShiftStatus }[];
  approvedLeave: { startDate: string; endDate: string; leaveTypeName: string }[];
  minRestHours: number;
  maxWeeklyHours: number;
  weekStartsOn: number;
  employeeActive: boolean;
}): ShiftWarning[] {
  const out: ShiftWarning[] = [];
  const { shift } = params;
  if (!params.employeeActive) out.push({ kind: "inactive", message: "This person is not active." });
  const leave = params.approvedLeave.find((l) => l.startDate <= shift.shiftDate && l.endDate >= shift.shiftDate);
  if (leave) out.push({ kind: "leave", message: `On ${leave.leaveTypeName.toLowerCase()} that day.` });

  const others = params.otherShifts.filter((o) => o.id !== shift.id && o.status !== "cancelled");
  const start = new Date(shift.startsAt).getTime();
  const end = new Date(shift.endsAt).getTime();
  const restMs = params.minRestHours * 3600000;
  for (const o of others) {
    const os = new Date(o.startsAt).getTime();
    const oe = new Date(o.endsAt).getTime();
    if (oe <= start && start - oe < restMs) {
      out.push({ kind: "rest", message: `Only ${Math.round(((start - oe) / 3600000) * 10) / 10}h rest after the previous shift.` });
      break;
    }
    if (os >= end && os - end < restMs) {
      out.push({ kind: "rest", message: `Only ${Math.round(((os - end) / 3600000) * 10) / 10}h rest before the next shift.` });
      break;
    }
  }

  const wk = weekStart(shift.shiftDate, params.weekStartsOn);
  const wkEnd = addDays(wk, 6);
  const weekHours =
    others.filter((o) => o.shiftDate >= wk && o.shiftDate <= wkEnd).reduce((s, o) => s + shiftHours(o), 0) + shiftHours(shift);
  if (weekHours > params.maxWeeklyHours) {
    out.push({ kind: "weekly_hours", message: `${Math.round(weekHours * 10) / 10}h this week, over the ${params.maxWeeklyHours}h limit.` });
  }
  return out;
}

/** Turns a date and a "HH:MM" local time into an ISO timestamp, using the hotel's UTC offset (Lagos = +01:00). */
export function localToIso(date: string, time: string, offset = "+01:00"): string {
  const t = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${t}${offset}`).toISOString();
}

export function isoToLocalTime(iso: string, timeZone = "Africa/Lagos"): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone });
}

export function isoToLocalDate(iso: string, timeZone = "Africa/Lagos"): string {
  return new Date(iso).toLocaleDateString("en-CA", { timeZone });
}

export function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

export function friendlyDbError(message: string | undefined | null): string {
  const m = message ?? "";
  if (m.includes("HR_SHIFT_OVERLAP")) return "This person already has a shift at that time.";
  if (m.includes("HR_LEAVE_OVERLAP")) return "This person already has approved leave on some of these days.";
  if (m.includes("HR_TIME_APPROVED")) return "This entry is approved. Reopen it before changing it.";
  if (m.includes("HR_PAYRUN_LOCKED")) return "This pay run is approved, so its payslips can't change.";
  if (m.includes("uq_hr_employees_pin")) return "Someone else already uses that PIN. Choose another.";
  if (m.includes("uq_hr_time_open")) return "This person is already clocked in.";
  if (m.includes("uq_hr_swaps_live")) return "There is already a request open for this shift.";
  if (m.includes("uq_hr_pay_runs_period")) return "There is already a pay run for this period.";
  if (m.includes("row-level security") || m.includes("permission denied")) return "Only the owner and people they choose can see or change pay and personal details.";
  return "Something went wrong. Try again.";
}
