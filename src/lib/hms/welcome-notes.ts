import { computeExpectedCompletedIso } from "@/lib/hms/guest-services";

/** Departments a welcome note can send a task to. */
export const WELCOME_NOTE_DEPARTMENTS = ["housekeeping", "food_beverage"] as const;
export type WelcomeNoteDepartment = (typeof WELCOME_NOTE_DEPARTMENTS)[number];

export const WELCOME_NOTE_DEPARTMENT_LABELS: Record<WelcomeNoteDepartment, string> = {
  housekeeping: "Housekeeping",
  food_beverage: "Food and drink",
};

export const WELCOME_NOTE_ITEMS = [
  { key: "room_amenity", label: "Amenity set in the room", department: "housekeeping" },
  { key: "turndown", label: "Turndown service", department: "housekeeping" },
  { key: "flowers", label: "Fresh flowers", department: "housekeeping" },
  { key: "fruit_basket", label: "Fruit basket", department: "food_beverage" },
  { key: "welcome_drink", label: "Welcome drink", department: "food_beverage" },
  { key: "cake", label: "Cake or sweets", department: "food_beverage" },
] as const satisfies readonly { key: string; label: string; department: WelcomeNoteDepartment }[];

export type WelcomeNoteItemKey = (typeof WELCOME_NOTE_ITEMS)[number]["key"];
export const WELCOME_NOTE_ITEM_KEYS = WELCOME_NOTE_ITEMS.map((i) => i.key) as [
  WelcomeNoteItemKey,
  ...WelcomeNoteItemKey[],
];

/** Every task made by a welcome note starts with this, so staff can tell it from other requests. */
export const WELCOME_TASK_PREFIX = "Welcome: ";

export type WelcomeNoteCustomItem = { label: string; department: WelcomeNoteDepartment };

export type WelcomeTaskSpec = {
  requestType: string;
  department: WelcomeNoteDepartment;
  details: string | null;
};

/**
 * Turns the chosen items into one task each. Repeats (same task name) are dropped, so ticking
 * the same item twice or typing it again as "other" never sends two tasks for it.
 */
export function planWelcomeTasks(params: {
  itemKeys: readonly WelcomeNoteItemKey[];
  custom?: WelcomeNoteCustomItem | null;
  note?: string | null;
}): WelcomeTaskSpec[] {
  const details = params.note?.trim() || null;
  const specs: WelcomeTaskSpec[] = [];
  const seen = new Set<string>();

  const add = (label: string, department: WelcomeNoteDepartment) => {
    const requestType = `${WELCOME_TASK_PREFIX}${label.trim()}`.slice(0, 120);
    const id = requestType.toLowerCase();
    if (seen.has(id)) return;
    seen.add(id);
    specs.push({ requestType, department, details });
  };

  for (const key of params.itemKeys) {
    const item = WELCOME_NOTE_ITEMS.find((i) => i.key === key);
    if (item) add(item.label, item.department);
  }
  const custom = params.custom;
  if (custom && custom.label.trim()) add(custom.label, custom.department);

  return specs;
}

/**
 * Welcome tasks are due when the guest arrives. If the guest is already due (or past due),
 * fall back to the department's usual turnaround from now.
 */
export function welcomeTaskDueIso(arrivalAtIso: string | null, department: string, nowMs = Date.now()): string {
  const arrival = arrivalAtIso ? new Date(arrivalAtIso).getTime() : NaN;
  if (Number.isFinite(arrival) && arrival > nowMs) return new Date(arrival).toISOString();
  return computeExpectedCompletedIso(new Date(nowMs).toISOString(), department);
}
