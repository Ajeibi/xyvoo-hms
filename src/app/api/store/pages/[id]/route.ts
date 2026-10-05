import { NextResponse } from "next/server";
import { resolveEditorRequest } from "@/lib/store/site/editor-api";
import { mapPage, pageSchema, toPageRow, type PageRow } from "@/lib/store/pages";

const COLUMNS = "id, title, slug, body, system_key, status, show_in_menu, seo_title, seo_description";

/** PATCH /api/store/pages/<id> { slug, page } */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveEditorRequest(body?.slug);
  if (resolved.error) return resolved.error;

  const parsed = pageSchema.safeParse(body?.page);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the page details." }, { status: 400 });

  const { data, error } = await resolved.service
    .schema("store")
    .from("pages")
    .update(toPageRow(parsed.data))
    .eq("id", (await params).id)
    .eq("tenant_id", resolved.access.tenantId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) {
    const taken = error.code === "23505";
    return NextResponse.json({ error: taken ? "Another page already uses that web address." : error.message }, { status: taken ? 409 : 500 });
  }
  if (!data) return NextResponse.json({ error: "Page not found." }, { status: 404 });
  return NextResponse.json({ page: mapPage(data as PageRow) });
}

/** DELETE /api/store/pages/<id>?slug= */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const resolved = await resolveEditorRequest(new URL(req.url).searchParams.get("slug"));
  if (resolved.error) return resolved.error;
  const { error } = await resolved.service.schema("store").from("pages").delete().eq("id", (await params).id).eq("tenant_id", resolved.access.tenantId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
