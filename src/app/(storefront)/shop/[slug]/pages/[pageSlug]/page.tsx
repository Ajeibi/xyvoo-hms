import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/storefront-theme/primitives";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";

type Props = { params: Promise<{ slug: string; pageSlug: string }> };

/**
 * Page body blocks as stored in store.pages.body. Rendered as plain text only:
 * merchant content never reaches the page as HTML.
 */
type PageBlock =
  | { type: "heading"; text: string }
  | { type: "text"; text: string }
  | { type: "list"; items: string[] }
  | { type: "faq"; items: Array<{ question: string; answer: string }> };

function toBlocks(value: unknown): PageBlock[] {
  if (!Array.isArray(value)) return [];
  return value.filter((b): b is PageBlock => {
    if (!b || typeof b !== "object") return false;
    const block = b as Record<string, unknown>;
    if (block.type === "heading" || block.type === "text") return typeof block.text === "string";
    if (block.type === "list") return Array.isArray(block.items) && block.items.every((i) => typeof i === "string");
    if (block.type === "faq")
      return Array.isArray(block.items) && block.items.every((i) => i && typeof i.question === "string" && typeof i.answer === "string");
    return false;
  });
}

async function load(params: Props["params"]) {
  const { slug, pageSlug } = await params;
  const storefront = await getStorefront(slug);
  if (!storefront) return null;

  const { data } = await createServerSupabaseClient()
    .schema("store")
    .from("pages")
    .select("title, body, seo_title, seo_description")
    .eq("tenant_id", storefront.tenant.id)
    .eq("slug", pageSlug)
    .eq("status", "published")
    .maybeSingle();

  return data ? { storefront, page: data } : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const found = await load(params);
  if (!found) return {};
  return {
    title: found.page.seo_title || found.page.title,
    description: found.page.seo_description || undefined,
    alternates: { canonical: STORE_PATHS.page((await params).pageSlug) },
  };
}

export default async function StorefrontContentPage({ params }: Props) {
  const found = await load(params);
  if (!found) notFound();
  const { storefront, page } = found;
  const blocks = toBlocks(page.body);

  return (
    <div className="container section">
      <Breadcrumb items={[{ label: "Home", href: storeHref(storefront.basePath, "/") }, { label: page.title }]} />
      <h1 className="h-page">{page.title}</h1>
      <div className="page-body body-copy">
        {blocks.map((block, i) => {
          switch (block.type) {
            case "heading":
              return (
                <h2 className="h-card" key={i}>
                  {block.text}
                </h2>
              );
            case "text":
              return block.text.split(/\n{2,}/).map((para, j) => <p key={`${i}-${j}`}>{para}</p>);
            case "list":
              return (
                <ul key={i}>
                  {block.items.map((item, j) => (
                    <li key={j}>{item}</li>
                  ))}
                </ul>
              );
            case "faq":
              return (
                <div className="accordion" key={i}>
                  {block.items.map((item, j) => (
                    <details key={j}>
                      <summary>{item.question}</summary>
                      <div className="accordion__body">
                        <p>{item.answer}</p>
                      </div>
                    </details>
                  ))}
                </div>
              );
          }
        })}
      </div>
    </div>
  );
}
