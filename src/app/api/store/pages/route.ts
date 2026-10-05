import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveEditorRequest } from "@/lib/store/site/editor-api";
import { mapPage, pageSchema, STARTER_PAGES, SYSTEM_PAGE_KEYS, toPageRow, type PageRow } from "@/lib/store/pages";

const COLUMNS = "id, title, slug, body, system_key, status, show_in_menu, seo_title, seo_description";

/** GET /api/store/pages?slug= — every page, drafts included. */
export async function GET(req: Request) {
  const resolved = await resolveEditorRequest(new URL(req.url).searchParams.get("slug"));
  if (resolved.error) return resolved.error;
  const { data, error } = await resolved.service
    .schema("store")
    .from("pages")
    .select(COLUMNS)
    .eq("tenant_id", resolved.access.tenantId)
    .order("sort_order")
    .order("created_at");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pages: ((data || []) as PageRow[]).map(mapPage) });
}

const CreateSchema = z.union([
  z.object({ slug: z.string().min(1), starter: z.enum(SYSTEM_PAGE_KEYS) }),
  z.object({ slug: z.string().min(1), page: pageSchema }),
]);

/**
 * POST /api/store/pages — { slug, starter } adds one of the starter pages as a
 * draft; { slug, page } adds a custom page.
 */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const resolved = await resolveEditorRequest(body?.slug);
  if (resolved.error) return resolved.error;

  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Check the page details." }, { status: 400 });

  const store = resolved.service.schema("store");
  const { count } = await store.from("pages").select("id", { count: "exact", head: true }).eq("tenant_id", resolved.access.tenantId);

  const row =
    "starter" in parsed.data
      ? (() => {
          const starter = STARTER_PAGES[parsed.data.starter];
          return {
            system_key: parsed.data.starter,
            ...toPageRow({ title: starter.title, slug: starter.slug, body: starter.body, status: "draft", showInMenu: false, seoTitle: "", seoDescription: "" }),
          };
        })()
      : { system_key: null, ...toPageRow(parsed.data.page) };

  const { data, error } = await store
    .from("pages")
    .insert({ tenant_id: resolved.access.tenantId, sort_order: count ?? 0, ...row })
    .select(COLUMNS)
    .single();
  if (error) {
    const taken = error.code === "23505";
    return NextResponse.json(
      { error: taken ? "That page already exists, or another page uses that web address." : error.message },
      { status: taken ? 409 : 500 },
    );
  }
  return NextResponse.json({ page: mapPage(data as PageRow) }, { status: 201 });
}
