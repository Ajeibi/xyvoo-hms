import { NextResponse } from "next/server";
import { z } from "zod";
import { logActivity } from "@/lib/store/activity";
import { resolveStoreRequest } from "@/lib/store/api-helpers";
import { blogPostInputSchema } from "@/lib/store/blog";
import { deleteBlogPost, updateBlogPost } from "@/lib/store/blog-server";

const ownersOnly = () => NextResponse.json({ error: "Only the owner or an admin can change blog posts." }, { status: 403 });
const notFound = () => NextResponse.json({ error: "That post can't be found. It may already have been removed." }, { status: 404 });

/** PUT /api/store/blog/:id { slug (the shop), postSlug, title, body, ... } */
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const resolved = await resolveStoreRequest(typeof body?.slug === "string" ? body.slug : "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  if (!z.string().uuid().safeParse(id).success) return notFound();
  const parsed = blogPostInputSchema.safeParse({ ...body, slug: typeof body?.postSlug === "string" ? body.postSlug : "" });
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the post.", field: parsed.error.issues[0]?.path[0] }, { status: 400 });
  const { post, error } = await updateBlogPost(resolved.access.tenantId, id, parsed.data);
  if (error?.code === "23505") return NextResponse.json({ error: "You already have a post with that web address.", field: "postSlug" }, { status: 409 });
  if (error) {
    console.error("[blog] update failed", error);
    return NextResponse.json({ error: "We couldn't save that post. Please try again." }, { status: 500 });
  }
  if (!post) return notFound();
  await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "blog", action: "updated", targetId: id, targetLabel: post.title });
  return NextResponse.json({ post });
}

/** DELETE /api/store/blog/:id?slug= */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resolved = await resolveStoreRequest(new URL(req.url).searchParams.get("slug") || "");
  if (resolved.error) return resolved.error;
  if (!resolved.capabilities.canManageSettings) return ownersOnly();
  if (!z.string().uuid().safeParse(id).success) return notFound();
  const { title, error } = await deleteBlogPost(resolved.access.tenantId, id);
  if (error) {
    console.error("[blog] delete failed", error);
    return NextResponse.json({ error: "We couldn't remove that post. Please try again." }, { status: 500 });
  }
  if (!title) return notFound();
  await logActivity({ tenantId: resolved.access.tenantId, actor: resolved.access, area: "blog", action: "deleted", targetId: id, targetLabel: title });
  return NextResponse.json({ ok: true });
}
