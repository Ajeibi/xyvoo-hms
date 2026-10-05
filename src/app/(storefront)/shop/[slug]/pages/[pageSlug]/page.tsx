import { Fragment } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumb } from "@/components/storefront-theme/primitives";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parsePageBlocks } from "@/lib/store/pages";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront, type Storefront } from "@/lib/store/site/storefront";

type Props = { params: Promise<{ slug: string; pageSlug: string }> };

async function load(params: Props["params"]) {
  const { slug, pageSlug } = await params;
  const storefront = await getStorefront(slug);
  if (!storefront) return null;

  // Store members previewing their shop can also see pages still in draft.
  const { data } = await createServerSupabaseClient()
    .schema("store")
    .from("pages")
    .select("title, body, seo_title, seo_description")
    .eq("tenant_id", storefront.tenant.id)
    .eq("slug", pageSlug)
    .in("status", storefront.isPreview ? ["draft", "published"] : ["published"])
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

/** The store's own contact details from Store details, so the Contact page never goes out of date. */
function ContactDetails({ storefront }: { storefront: Storefront }) {
  const { profile } = storefront;
  const address = [profile.addressLine1, profile.addressLine2, profile.city, profile.state].filter(Boolean).join(", ");
  const whatsappDigits = profile.whatsapp?.replace(/\D/g, "");
  const rows: Array<{ label: string; value: React.ReactNode } | null> = [
    profile.businessEmail ? { label: "Email", value: <a href={`mailto:${profile.businessEmail}`}>{profile.businessEmail}</a> } : null,
    profile.phone ? { label: "Phone", value: <a href={`tel:${profile.phone.replace(/[^\d+]/g, "")}`}>{profile.phone}</a> } : null,
    whatsappDigits
      ? { label: "WhatsApp", value: <a href={`https://wa.me/${whatsappDigits}`} rel="noopener noreferrer" target="_blank">{profile.whatsapp}</a> }
      : null,
    address ? { label: "Address", value: address } : null,
  ];
  const shown = rows.filter((r): r is { label: string; value: React.ReactNode } => r !== null);
  if (!shown.length) return null;

  return (
    <dl className="spec">
      {shown.map((row) => (
        <Fragment key={row.label}>
          <dt>{row.label}</dt>
          <dd>{row.value}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export default async function StorefrontContentPage({ params }: Props) {
  const found = await load(params);
  if (!found) notFound();
  const { storefront, page } = found;
  const blocks = parsePageBlocks(page.body);

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
            case "contact":
              return <ContactDetails key={i} storefront={storefront} />;
          }
        })}
      </div>
    </div>
  );
}
