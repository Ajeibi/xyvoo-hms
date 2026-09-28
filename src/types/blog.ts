export type BlogCategory =
  | "Operations"
  | "Revenue"
  | "Guest Experience"
  | "Finance";

export type BlogBodyBlock =
  | { type: "p"; text: string }
  | { type: "h2"; text: string }
  | { type: "list"; items: string[] }
  | { type: "quote"; text: string }
  /** Renders a download card for a real PDF from the resource library, by its `Resource["slug"]`. */
  | { type: "resource"; slug: string };

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  category: BlogCategory;
  readTime: string;
  date: string;
  featured: boolean;
  color: string;
  author: string;
  body: BlogBodyBlock[];
};
