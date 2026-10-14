import { z } from "zod";
import { SEGMENT_LABELS, SEGMENTS, type CustomerRow } from "./customers";

/*
 * The shop's own customer groups: saved rules such as "spent over ₦100,000"
 * or "haven't ordered in 90 days". Membership is worked out from the customer
 * list each time it is asked, so a group is never out of date. No server code
 * here, so the dashboard shows the live count as the rules change.
 */

export const RULE_FIELDS = ["totalSpent", "paidOrders", "daysSinceLastOrder", "daysSinceFirstOrder", "group", "tag", "email", "phone"] as const;
export type RuleField = (typeof RULE_FIELDS)[number];

export const RULE_FIELD_LABELS: Record<RuleField, string> = {
  totalSpent: "Total spent",
  paidOrders: "Paid orders",
  daysSinceLastOrder: "Days since last order",
  daysSinceFirstOrder: "Days since first order",
  group: "Automatic group",
  tag: "Tag",
  email: "Email address",
  phone: "Phone number",
};

export type RuleOperator = "gte" | "lte" | "is" | "isNot" | "has" | "hasNot";

/** Which comparisons make sense for each field, first one is the default. */
export const FIELD_OPERATORS: Record<RuleField, RuleOperator[]> = {
  totalSpent: ["gte", "lte"],
  paidOrders: ["gte", "lte"],
  daysSinceLastOrder: ["gte", "lte"],
  daysSinceFirstOrder: ["gte", "lte"],
  group: ["is", "isNot"],
  tag: ["has", "hasNot"],
  email: ["has", "hasNot"],
  phone: ["has", "hasNot"],
};

const NUMBER_FIELDS: RuleField[] = ["totalSpent", "paidOrders", "daysSinceLastOrder", "daysSinceFirstOrder"];

/** The words for a comparison, e.g. "is at least", "is not", "is given". */
export function operatorLabel(field: RuleField, op: RuleOperator) {
  if (NUMBER_FIELDS.includes(field)) return op === "gte" ? "is at least" : "is at most";
  if (field === "email" || field === "phone") return op === "has" ? "is given" : "is not given";
  return op === "is" || op === "has" ? "is" : "is not";
}

/** Rules that need a value typed or chosen (email and phone only ask whether it is given). */
export const needsValue = (field: RuleField) => field !== "email" && field !== "phone";

export const ruleSchema = z
  .object({
    field: z.enum(RULE_FIELDS),
    op: z.enum(["gte", "lte", "is", "isNot", "has", "hasNot"]),
    value: z.union([z.string().trim().max(60), z.number()]).default(""),
  })
  .superRefine((rule, ctx) => {
    if (!FIELD_OPERATORS[rule.field].includes(rule.op)) {
      ctx.addIssue({ code: "custom", path: ["op"], message: `Choose how to compare “${RULE_FIELD_LABELS[rule.field]}”.` });
      return;
    }
    if (!needsValue(rule.field)) return;
    if (rule.field === "group") {
      if (!(SEGMENTS as readonly string[]).includes(String(rule.value))) ctx.addIssue({ code: "custom", path: ["value"], message: "Choose an automatic group." });
    } else if (rule.field === "tag") {
      if (!String(rule.value).trim()) ctx.addIssue({ code: "custom", path: ["value"], message: "Type the tag to look for." });
    } else {
      const n = Number(rule.value);
      if (String(rule.value).trim() === "" || !Number.isFinite(n) || n < 0) ctx.addIssue({ code: "custom", path: ["value"], message: `Enter a number for “${RULE_FIELD_LABELS[rule.field]}”, zero or more.` });
    }
  });
export type CustomerRule = z.infer<typeof ruleSchema>;

export const groupInputSchema = z.object({
  name: z.string().trim().min(1, "Give the group a name.").max(60, "Keep the name under 60 characters."),
  match: z.enum(["all", "any"]).default("all"),
  rules: z.array(ruleSchema).min(1, "Add at least one rule.").max(8, "Use up to 8 rules."),
});
export type CustomerGroupInput = z.infer<typeof groupInputSchema>;

export type CustomerGroup = CustomerGroupInput & { id: string; createdAt: string };

type GroupSubject = Pick<CustomerRow, "totalSpent" | "paidOrders" | "lastOrderAt" | "firstOrderAt" | "segment" | "tags" | "email" | "phone">;

const DAY = 86_400_000;
const daysSince = (iso: string, now: number) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY));

export function ruleMatches(rule: CustomerRule, c: GroupSubject, now = Date.now()) {
  const n = Number(rule.value);
  switch (rule.field) {
    case "totalSpent":
      return rule.op === "gte" ? c.totalSpent >= n : c.totalSpent <= n;
    case "paidOrders":
      return rule.op === "gte" ? c.paidOrders >= n : c.paidOrders <= n;
    case "daysSinceLastOrder": {
      const d = daysSince(c.lastOrderAt, now);
      return rule.op === "gte" ? d >= n : d <= n;
    }
    case "daysSinceFirstOrder": {
      const d = daysSince(c.firstOrderAt, now);
      return rule.op === "gte" ? d >= n : d <= n;
    }
    case "group":
      return rule.op === "is" ? c.segment === rule.value : c.segment !== rule.value;
    case "tag": {
      const has = c.tags.includes(String(rule.value).trim().toLowerCase());
      return rule.op === "has" ? has : !has;
    }
    case "email":
      return rule.op === "has" ? Boolean(c.email) : !c.email;
    case "phone":
      return rule.op === "has" ? Boolean(c.phone) : !c.phone;
  }
}

export function inGroup(group: Pick<CustomerGroupInput, "match" | "rules">, customer: GroupSubject, now = Date.now()) {
  if (!group.rules.length) return false;
  const test = (r: CustomerRule) => ruleMatches(r, customer, now);
  return group.match === "all" ? group.rules.every(test) : group.rules.some(test);
}

/** One rule in plain words, e.g. "Total spent is at least ₦100,000". */
export function describeRule(rule: CustomerRule, money: (n: number) => string) {
  const label = RULE_FIELD_LABELS[rule.field];
  const op = operatorLabel(rule.field, rule.op);
  if (!needsValue(rule.field)) return `${label} ${op}`;
  if (rule.field === "group") return `${label} ${op} ${SEGMENT_LABELS[rule.value as keyof typeof SEGMENT_LABELS] ?? rule.value}`;
  if (rule.field === "tag") return `${label} ${op} #${String(rule.value).toLowerCase()}`;
  return `${label} ${op} ${rule.field === "totalSpent" ? money(Number(rule.value)) : rule.value}`;
}
