import { z } from "zod";

/*
 * Email campaigns: what a campaign is made of and the rules for it. No server
 * code here, so the dashboard editor and the sender share it.
 */

export const CAMPAIGN_STATUSES = ["draft", "scheduled", "sending", "sent", "cancelled"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sending: "Sending",
  sent: "Sent",
  cancelled: "Cancelled",
};

/** Emails a shop can send in one day, until plan limits are chosen. */
export const DAILY_SEND_LIMIT = 500;

/** A link must be a secure web address, or a path on the shop itself. */
const linkTarget = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v.startsWith("/") || /^https:\/\/[^\s]+$/i.test(v), "Use a link that starts with https:// or a path on your shop such as /products.");

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: z.string().trim().min(1, "A heading can't be empty.").max(120, "Keep headings under 120 characters.") }),
  z.object({ type: z.literal("text"), text: z.string().trim().min(1, "A paragraph can't be empty.").max(2000, "Keep each paragraph under 2,000 characters.") }),
  z.object({ type: z.literal("button"), label: z.string().trim().min(1, "A button needs words on it.").max(40, "Keep button words under 40 characters."), url: linkTarget }),
  z.object({ type: z.literal("product"), productId: z.string().uuid("Choose a product.") }),
]);
export type CampaignBlock = z.infer<typeof blockSchema>;

export const audienceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("everyone") }),
  z.object({ type: z.literal("segment"), key: z.enum(["vip", "repeat", "new", "one_time", "at_risk", "lapsed", "not_paid"]) }),
  z.object({ type: z.literal("group"), id: z.string().uuid() }),
]);
export type CampaignAudience = z.infer<typeof audienceSchema>;

export const campaignInputSchema = z.object({
  subject: z.string().trim().min(1, "Write a subject line.").max(150, "Keep the subject under 150 characters."),
  previewText: z
    .string()
    .trim()
    .max(200, "Keep the preview under 200 characters.")
    .optional()
    .transform((v) => v || null),
  blocks: z.array(blockSchema).min(1, "Add something to say.").max(30, "Use up to 30 blocks."),
  audience: audienceSchema.default({ type: "everyone" }),
});
export type CampaignInput = z.infer<typeof campaignInputSchema>;

/** Sending later: a time at least five minutes away and not more than a year. */
export function scheduleError(scheduledAt: string | null, now: Date) {
  if (!scheduledAt) return null;
  const at = new Date(scheduledAt).getTime();
  if (Number.isNaN(at)) return "Choose a valid date and time.";
  if (at < now.getTime() + 5 * 60_000) return "Choose a time at least five minutes from now.";
  if (at > now.getTime() + 365 * 86_400_000) return "Choose a date within the next year.";
  return null;
}

export type CampaignStats = {
  recipients: number;
  sent: number;
  failed: number;
  pending: number;
  opened: number;
  clicked: number;
  unsubscribed: number;
};

/** Rates as whole percentages of the emails that went out; zero when none have. */
export function campaignRates(s: Pick<CampaignStats, "sent" | "opened" | "clicked" | "unsubscribed">) {
  const pct = (n: number) => (s.sent > 0 ? Math.round((n / s.sent) * 100) : 0);
  return { opened: pct(s.opened), clicked: pct(s.clicked), unsubscribed: pct(s.unsubscribed) };
}

/** How many more emails a shop can send today, given what has already gone out in the last 24 hours. */
export function sendAllowance(sentLast24h: number, limit = DAILY_SEND_LIMIT) {
  return Math.max(0, limit - sentLast24h);
}
