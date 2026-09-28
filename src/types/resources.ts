export type ResourceCategory =
  | "Operations"
  | "Revenue"
  | "Technology"
  | "Finance"
  | "Storefront";

export type Resource = {
  slug: string;
  title: string;
  summary: string;
  category: ResourceCategory;
  /** Filename only — served from /docs/<file>. */
  file: string;
  pages: number;
  readTime: string;
  date: string;
  audience: string;
  tags: string[];
};
