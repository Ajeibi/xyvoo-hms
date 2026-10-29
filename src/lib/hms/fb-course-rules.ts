/**
 * Courses and fire timing. Pure functions shared by the POS, the kitchen
 * screen and the server.
 *
 * Course 0 ("straight away", e.g. drinks) always goes to the kitchen at once.
 * Courses 1+ go one at a time: on send, the first course fires and the rest
 * are held until staff fire them.
 */

export const FB_COURSES = [
  { value: 0, label: "Straight away" },
  { value: 1, label: "Starters" },
  { value: 2, label: "Mains" },
  { value: 3, label: "Desserts" },
] as const;

export const FB_COURSE_MAX = 3;

export function courseLabel(course: number) {
  return FB_COURSES.find((c) => c.value === course)?.label ?? `Course ${course}`;
}

/** The course a new line starts on: its category's setting, else straight away for bars and starters elsewhere. */
export function defaultCourseFor(
  categoryDefault: number | null | undefined,
  outletType: string | null | undefined,
) {
  if (categoryDefault != null && categoryDefault >= 0 && categoryDefault <= FB_COURSE_MAX) {
    return categoryDefault;
  }
  return outletType === "bar" ? 0 : 1;
}

/**
 * How a ticket goes to the kitchen:
 * - "first_course": straight-away items and the first course now, the rest held.
 * - "all": everything now.
 * - "hold": straight-away items now, every course held.
 */
export type FbFireMode = "first_course" | "all" | "hold";

export type FireableItem = {
  id: string;
  course: number;
  fired_at: string | null;
  kitchen_status: string;
};

function unfired(items: FireableItem[]) {
  return items.filter((i) => !i.fired_at && i.kitchen_status !== "voided");
}

/** Highest course already fired on this order, or null if none has been. */
export function highestFiredCourse(items: FireableItem[]) {
  let max: number | null = null;
  for (const i of items) {
    if (i.fired_at && i.kitchen_status !== "voided" && i.course >= 1 && (max == null || i.course > max)) {
      max = i.course;
    }
  }
  return max;
}

/**
 * Which unfired lines to release now. `alreadySent` is true when the order
 * was sent before (an item added later): then nothing new fires unless its
 * course is straight away or no later than a course already fired, so a
 * held order stays held.
 */
export function itemsToFire(items: FireableItem[], mode: FbFireMode, alreadySent = false): string[] {
  const pending = unfired(items);
  if (mode === "all") return pending.map((i) => i.id);

  const now = pending.filter((i) => i.course === 0);
  if (mode === "hold") return now.map((i) => i.id);

  const fired = highestFiredCourse(items);
  const courses = pending.filter((i) => i.course >= 1);
  if (fired != null) {
    return [...now, ...courses.filter((i) => i.course <= fired)].map((i) => i.id);
  }
  if (alreadySent || !courses.length) return now.map((i) => i.id);

  const first = Math.min(...courses.map((i) => i.course));
  return [...now, ...courses.filter((i) => i.course === first)].map((i) => i.id);
}

/** Unfired lines of one course (or every held course). */
export function itemsToFireForCourse(items: FireableItem[], course: number | "all"): string[] {
  return unfired(items)
    .filter((i) => course === "all" || i.course === course)
    .map((i) => i.id);
}

export type CourseState = {
  course: number;
  label: string;
  total: number;
  held: number;
  ready: number;
  served: number;
  /** Earliest time any line of this course was fired. */
  firedAt: string | null;
};

/** One row per course on the order, in course order (voided lines left out). */
export function summariseCourses(items: FireableItem[]): CourseState[] {
  const byCourse = new Map<number, CourseState>();
  for (const i of items) {
    if (i.kitchen_status === "voided") continue;
    const row =
      byCourse.get(i.course) ??
      { course: i.course, label: courseLabel(i.course), total: 0, held: 0, ready: 0, served: 0, firedAt: null };
    row.total += 1;
    if (!i.fired_at) row.held += 1;
    else if (!row.firedAt || i.fired_at < row.firedAt) row.firedAt = i.fired_at;
    if (i.kitchen_status === "ready") row.ready += 1;
    if (i.kitchen_status === "served") row.served += 1;
    byCourse.set(i.course, row);
  }
  return [...byCourse.values()].sort((a, b) => a.course - b.course);
}

/** True when the ticket mixes more than one course worth pacing (straight-away items don't count). */
export function hasSeveralCourses(courses: number[]) {
  return new Set(courses.filter((c) => c >= 1)).size > 1;
}
