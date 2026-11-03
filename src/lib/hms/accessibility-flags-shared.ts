/* Browser-safe parts of accessibility flags: the list, wording and the room-fit hint. */

export const ACCESSIBILITY_FLAGS = ["wheelchair", "mobility", "hearing", "visual"] as const;
export type AccessibilityFlag = (typeof ACCESSIBILITY_FLAGS)[number];

export const ACCESSIBILITY_LABELS: Record<AccessibilityFlag, string> = {
  wheelchair: "Wheelchair user",
  mobility: "Limited mobility",
  hearing: "Hard of hearing",
  visual: "Low vision",
};

/** What housekeeping and the desk should do about each one. */
export const ACCESSIBILITY_HINTS: Record<AccessibilityFlag, string> = {
  wheelchair: "Needs a step-free route and a room that fits a wheelchair.",
  mobility: "Best on a low floor, near the lift.",
  hearing: "Use the phone text option; knock firmly and use the door light.",
  visual: "Keep walkways clear and tell the guest where things are placed.",
};

/** Keeps only known flags, once each, in the usual order. */
export function cleanFlags(input: unknown): AccessibilityFlag[] {
  const list = Array.isArray(input) ? input : [];
  return ACCESSIBILITY_FLAGS.filter((f) => list.includes(f));
}

/** The stay's own flags plus any the guest has on their profile. */
export function mergeFlags(stay: unknown, guest: unknown): AccessibilityFlag[] {
  return cleanFlags([...cleanFlags(stay), ...cleanFlags(guest)]);
}

export function flagsSummary(flags: AccessibilityFlag[]) {
  return flags.map((f) => ACCESSIBILITY_LABELS[f]).join(", ");
}

/** A warning when the assigned room may not suit the guest, or null when nothing stands out. */
export function roomFitWarning(flags: AccessibilityFlag[], room: { code: string | null; floor: number | null }): string | null {
  if (!room.code || room.floor == null) return null;
  const needsLowFloor = flags.includes("wheelchair") || flags.includes("mobility");
  if (needsLowFloor && room.floor > 1) {
    return `Room ${room.code} is on floor ${room.floor}. Check the lift works, or move the guest to a lower floor.`;
  }
  return null;
}
