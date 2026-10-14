import { z } from "zod";

/*
 * The shop's blog: what a post is made of and the rules for it. No server
 * code, so the dashboard editor, the shop pages and the sitemap agree.
 */

const text = (max: number) => z.string().trim().max(max);

const imageUrl = z
  .string()
  .trim()
  .url()
  .max(1000)
  .refine((u) => u.startsWith("https://"), "Use an image uploaded to your shop.");

export const blogBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: text(140).min(1, "A heading can't be empty.") }),
  z.object({ type: z.literal("text"), text: text(5000).min(1, "A paragraph can't be empty.") }),
  z.object({ type: z.literal("list"), items: z.array(text(300).min(1, "A list item can't be empty.")).min(1, "Add at least one item to the list.").max(30) }),
  z.object({ type: z.literal("image"), url: imageUrl, alt: text(200).min(1, "Describe each picture for people who can't see it."), caption: text(200).default("") }),
]);
export type BlogBlock = z.infer<typeof blogBlockSchema>;

export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** "Our Spring Edit: 5 Things!" becomes "our-spring-edit-5-things". */
export function slugifyTitle(title: string) {
  return title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

export const blogPostInputSchema = z
  .object({
    title: text(140).min(1, "Give the post a title."),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .max(80)
      .optional()
      .transform((v) => v || ""),
    summary: text(300).optional().transform((v) => v || null),
    body: z.array(blogBlockSchema).max(80, "Use up to 80 blocks."),
    coverUrl: imageUrl.nullable().optional().transform((v) => v ?? null),
    coverAlt: text(200).optional().transform((v) => v || null),
    author: text(80).optional().transform((v) => v || null),
    status: z.enum(["draft", "published"]),
    /** When it goes live. Empty with "published" means now. */
    publishedAt: z
      .string()
      .trim()
      .optional()
      .nullable()
      .transform((v) => v || null)
      .refine((v) => v === null || !Number.isNaN(new Date(v).getTime()), "Enter a valid publish date."),
    seoTitle: text(70).optional().transform((v) => v || null),
    seoDescription: text(170).optional().transform((v) => v || null),
  })
  .superRefine((p, ctx) => {
    if (p.slug && !SLUG_PATTERN.test(p.slug)) ctx.addIssue({ code: "custom", path: ["slug"], message: "Use lower-case letters, numbers and single dashes in the web address." });
    if (p.coverUrl && !p.coverAlt) ctx.addIssue({ code: "custom", path: ["coverAlt"], message: "Describe the cover picture for people who can't see it." });
    if (p.status === "published" && p.body.length === 0) ctx.addIssue({ code: "custom", path: ["body"], message: "Write something before you publish." });
  })
  .transform((p) => ({ ...p, slug: p.slug || slugifyTitle(p.title) }));
export type BlogPostInput = z.infer<typeof blogPostInputSchema>;

/** Whether a post can be seen by shoppers now. */
export function isPostLive(post: { status: string; publishedAt: string | null }, now: Date) {
  return post.status === "published" && post.publishedAt !== null && new Date(post.publishedAt).getTime() <= now.getTime();
}

/** About how long a post takes to read, at 200 words a minute, never less than a minute. */
export function readingMinutes(body: BlogBlock[]) {
  const words = body.reduce((n, b) => {
    const chunk = b.type === "list" ? b.items.join(" ") : b.type === "image" ? b.caption : b.text;
    return n + chunk.split(/\s+/).filter(Boolean).length;
  }, 0);
  return Math.max(1, Math.round(words / 200));
}

/** The post's own words for search results and sharing: the summary, or the start of the first paragraph. */
export function postDescription(post: { summary: string | null; seoDescription: string | null; body: BlogBlock[] }) {
  if (post.seoDescription) return post.seoDescription;
  if (post.summary) return post.summary;
  const first = post.body.find((b): b is Extract<BlogBlock, { type: "text" }> => b.type === "text");
  if (!first) return undefined;
  return first.text.length > 160 ? `${first.text.slice(0, 157).trimEnd()}…` : first.text;
}
