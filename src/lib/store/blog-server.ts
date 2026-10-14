import { createServerSupabaseClient } from "@/lib/supabase/server";
import { blogBlockSchema, isPostLive, type BlogBlock, type BlogPostInput } from "./blog";

const db = () => createServerSupabaseClient().schema("store");
const missing = (error: { code?: string } | null) => Boolean(error && ["42P01", "PGRST205"].includes(error.code ?? ""));

export type BlogPost = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  body: BlogBlock[];
  coverUrl: string | null;
  coverAlt: string | null;
  author: string | null;
  status: "draft" | "published";
  publishedAt: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  createdAt: string;
  updatedAt: string;
};

const COLUMNS = "id, slug, title, summary, body, cover_url, cover_alt, author, status, published_at, seo_title, seo_description, created_at, updated_at";

function toPost(r: Record<string, unknown>): BlogPost {
  const body = blogBlockSchema.array().safeParse(r.body);
  return {
    id: r.id as string,
    slug: r.slug as string,
    title: r.title as string,
    summary: (r.summary as string | null) ?? null,
    body: body.success ? body.data : [],
    coverUrl: (r.cover_url as string | null) ?? null,
    coverAlt: (r.cover_alt as string | null) ?? null,
    author: (r.author as string | null) ?? null,
    status: r.status as "draft" | "published",
    publishedAt: (r.published_at as string | null) ?? null,
    seoTitle: (r.seo_title as string | null) ?? null,
    seoDescription: (r.seo_description as string | null) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

const toRow = (input: BlogPostInput) => ({
  slug: input.slug,
  title: input.title,
  summary: input.summary,
  body: input.body,
  cover_url: input.coverUrl,
  cover_alt: input.coverUrl ? input.coverAlt : null,
  author: input.author,
  status: input.status,
  // Published without a date means published now; a draft keeps whatever date was chosen.
  published_at: input.status === "published" ? (input.publishedAt ? new Date(input.publishedAt).toISOString() : new Date().toISOString()) : input.publishedAt ? new Date(input.publishedAt).toISOString() : null,
  seo_title: input.seoTitle,
  seo_description: input.seoDescription,
});

export async function listBlogPosts(tenantId: string): Promise<BlogPost[]> {
  const { data, error } = await db().from("blog_posts").select(COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(500);
  if (error) {
    if (missing(error)) return [];
    throw new Error(error.message);
  }
  return (data || []).map(toPost);
}

export async function createBlogPost(tenantId: string, userId: string | null, input: BlogPostInput) {
  const { data, error } = await db().from("blog_posts").insert({ tenant_id: tenantId, created_by: userId, ...toRow(input) }).select(COLUMNS).single();
  return { post: data ? toPost(data) : null, error };
}

export async function updateBlogPost(tenantId: string, id: string, input: BlogPostInput) {
  const { data, error } = await db().from("blog_posts").update(toRow(input)).eq("tenant_id", tenantId).eq("id", id).select(COLUMNS).maybeSingle();
  return { post: data ? toPost(data) : null, error };
}

export async function deleteBlogPost(tenantId: string, id: string) {
  const { data, error } = await db().from("blog_posts").delete().eq("tenant_id", tenantId).eq("id", id).select("title").maybeSingle();
  return { title: (data?.title as string | undefined) ?? null, error };
}

/** Posts shoppers can see now, newest first. */
export async function listPublishedPosts(tenantId: string, limit = 12, offset = 0): Promise<BlogPost[]> {
  const { data, error } = await db()
    .from("blog_posts")
    .select(COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) {
    if (missing(error)) return [];
    throw new Error(error.message);
  }
  return (data || []).map(toPost);
}

/** One post by its web address. A shop member previewing can also read a draft. */
export async function getPost(tenantId: string, slug: string, includeDrafts = false): Promise<BlogPost | null> {
  const { data, error } = await db().from("blog_posts").select(COLUMNS).eq("tenant_id", tenantId).eq("slug", slug).maybeSingle();
  if (error) {
    if (missing(error)) return null;
    throw new Error(error.message);
  }
  if (!data) return null;
  const post = toPost(data);
  return includeDrafts || isPostLive(post, new Date()) ? post : null;
}

export async function countPublishedPosts(tenantId: string): Promise<number> {
  const { count, error } = await db().from("blog_posts").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("status", "published").lte("published_at", new Date().toISOString());
  if (error) return 0;
  return count ?? 0;
}
