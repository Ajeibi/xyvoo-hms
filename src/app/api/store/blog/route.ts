import { NextResponse } from "next/server";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { blogPostInputSchema } from "@/lib/store/blog";
import { createBlogPost, listBlogPosts } from "@/lib/store/blog-server";

const ownersOnly = () => NextResponse.json({ error: "Only the owner or an admin can write blog posts." }, { status: 403 });

/** GET /api/store/blog?slug= — every post, drafts included. */
export async function GET(req: Request) {
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  try {
    return NextResponse.json({ posts: await listBlogPosts(resolved.access.tenantId) });
  } catch (error) {
    console.error("[blog] list failed", error);
    return NextResponse.json({ error: "We couldn't load your posts just now." }, { status: 500 });
  }
}

/** POST /api/store/blog { slug, title, body, ... } — a new post. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  // The shop's name in the request is `slug`; the post's own web address travels as `postSlug`.
  const parsed = blogPostInputSchema.safeParse({ ...body, slug: typeof body?.postSlug === "string" ? body.postSlug : "" });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the post.", field: parsed.error.issues[0]?.path[0] }, { status: 400 });
  const { post, error } = await createBlogPost(resolved.access.tenantId, resolved.access.userId, parsed.data);
  if (error?.code === "23505") return NextResponse.json({ error: "You already have a post with that web address. Change the address, or edit the other post.", field: "postSlug" }, { status: 409 });
  if (error || !post) {
    console.error("[blog] create failed", error);
    return NextResponse.json({ error: "We couldn't save that post. Please try again." }, { status: 500 });
  }
  await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "blog", action: post.status === "published" ? "published" : "created", targetId: post.id, targetLabel: post.title });
  return NextResponse.json({ post }, { status: 201 });
}
