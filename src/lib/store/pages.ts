import { z } from "zod";

/**
 * Store content pages (store.pages): About, Contact, FAQs, policies and
 * custom pages. Bodies are structured blocks rendered as plain text, so
 * merchant content never reaches the shop as HTML.
 */

export const SYSTEM_PAGE_KEYS = ["about", "contact", "faqs", "delivery-returns", "privacy", "terms"] as const;
export type SystemPageKey = (typeof SYSTEM_PAGE_KEYS)[number];

const shortText = (max: number) => z.string().trim().max(max);

export const pageBlockSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("heading"), text: shortText(120).min(1, "Headings can't be empty.") }),
  z.object({ type: z.literal("text"), text: shortText(5000).min(1, "Text blocks can't be empty.") }),
  z.object({ type: z.literal("list"), items: z.array(shortText(300).min(1)).min(1).max(30) }),
  z.object({
    type: z.literal("faq"),
    items: z.array(z.object({ question: shortText(200).min(1), answer: shortText(2000).min(1) })).min(1).max(40),
  }),
  /** The store's email, phone, WhatsApp and address from Store details, kept up to date automatically. */
  z.object({ type: z.literal("contact") }),
]);

export type PageBlock = z.infer<typeof pageBlockSchema>;

export const pageSchema = z.object({
  title: shortText(80).min(2, "Give the page a title."),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single hyphens for the web address.")
    .max(80),
  body: z.array(pageBlockSchema).max(50),
  status: z.enum(["draft", "published"]),
  showInMenu: z.boolean(),
  seoTitle: shortText(70),
  seoDescription: shortText(160),
});

export type PageInput = z.infer<typeof pageSchema>;

/** Keeps the blocks that are valid, dropping any that no longer match (e.g. after a change of format). */
export function parsePageBlocks(value: unknown): PageBlock[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((b) => {
    const parsed = pageBlockSchema.safeParse(b);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Starter pages. They're created as drafts, with prompts in square brackets
 * for the merchant to replace, so nothing goes live until they've written it.
 * The policy pages are outlines, not legal text.
 */
export const STARTER_PAGES: Record<SystemPageKey, { title: string; slug: string; body: PageBlock[] }> = {
  about: {
    title: "About us",
    slug: "about",
    body: [
      { type: "text", text: "[Tell customers who you are and how your business started.]" },
      { type: "heading", text: "What we believe in" },
      { type: "text", text: "[What makes your products or service different? Why should customers choose you?]" },
    ],
  },
  contact: {
    title: "Contact us",
    slug: "contact",
    body: [{ type: "text", text: "We'd love to hear from you. Get in touch using the details below." }, { type: "contact" }],
  },
  faqs: {
    title: "Frequently asked questions",
    slug: "faqs",
    body: [
      {
        type: "faq",
        items: [
          { question: "How long does delivery take?", answer: "[Explain your usual delivery times.]" },
          { question: "How do I pay?", answer: "You can pay securely by card, bank transfer or USSD through Paystack at checkout." },
          { question: "Can I return an item?", answer: "[Explain your returns policy.]" },
        ],
      },
    ],
  },
  "delivery-returns": {
    title: "Delivery and returns",
    slug: "delivery-returns",
    body: [
      { type: "heading", text: "Delivery" },
      { type: "text", text: "[Where you deliver, how much it costs and how long it takes.]" },
      { type: "heading", text: "Returns" },
      { type: "text", text: "[How many days customers have to return an item, what condition it must be in, and how refunds are made.]" },
    ],
  },
  privacy: {
    title: "Privacy policy",
    slug: "privacy",
    body: [
      { type: "text", text: "[This outline helps you write your privacy policy. Have it checked before you publish it.]" },
      { type: "heading", text: "What we collect" },
      { type: "text", text: "[The personal details you collect at checkout, such as name, email, phone number and delivery address.]" },
      { type: "heading", text: "How we use it" },
      { type: "text", text: "[For example: to process and deliver orders and to contact customers about them.]" },
      { type: "heading", text: "Who we share it with" },
      { type: "text", text: "[For example: Paystack to take payment, and your delivery partners.]" },
      { type: "heading", text: "Your rights and how to contact us" },
      { type: "text", text: "[How customers can ask to see, correct or delete their information, and how to reach you.]" },
    ],
  },
  terms: {
    title: "Terms of sale",
    slug: "terms",
    body: [
      { type: "text", text: "[This outline helps you write your terms of sale. Have them checked before you publish them.]" },
      { type: "heading", text: "Orders and payment" },
      { type: "text", text: "[When an order is confirmed, accepted payment methods and pricing.]" },
      { type: "heading", text: "Delivery" },
      { type: "text", text: "[Delivery areas, timescales and what happens if a delivery fails.]" },
      { type: "heading", text: "Returns and refunds" },
      { type: "text", text: "[Your returns window and how refunds are handled.]" },
    ],
  },
};

export type StorePage = PageInput & { id: string; systemKey: SystemPageKey | null };

export type PageRow = {
  id: string;
  title: string;
  slug: string;
  body: unknown;
  system_key: SystemPageKey | null;
  status: "draft" | "published";
  show_in_menu: boolean;
  seo_title: string | null;
  seo_description: string | null;
};

export function mapPage(row: PageRow): StorePage {
  return {
    id: row.id,
    title: row.title,
    slug: row.slug,
    body: parsePageBlocks(row.body),
    systemKey: row.system_key,
    status: row.status,
    showInMenu: row.show_in_menu,
    seoTitle: row.seo_title ?? "",
    seoDescription: row.seo_description ?? "",
  };
}

export function toPageRow(input: PageInput) {
  return {
    title: input.title,
    slug: input.slug,
    body: input.body,
    status: input.status,
    show_in_menu: input.showInMenu,
    seo_title: input.seoTitle || null,
    seo_description: input.seoDescription || null,
  };
}
