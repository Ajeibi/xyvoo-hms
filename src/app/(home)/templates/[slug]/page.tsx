import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, Check } from "lucide-react";
import { TemplatePreviewer } from "@/components/website/TemplatePreviewer";
import { WEBSITE_TEMPLATES, getWebsiteTemplate } from "@/constants/website-templates";

/** Same static grid backdrop as the /templates and /solution/storefront heroes. */
const HERO_GRID_STYLE: CSSProperties = {
  backgroundImage: `
      linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
    `,
  backgroundSize: "40px 40px",
};

/** The product each template kind runs on, linked first in the hero. */
const PRODUCT_LINKS = {
  storefront: {
    href: "/solution/storefront",
    title: "XYVOO Storefront",
    description: "The catalogue, orders and payments that power this template.",
  },
  hotel: {
    href: "/solution/hms",
    title: "XYVOO HMS",
    description: "The reservations, rooms and front desk system behind this template.",
  },
} as const;

export const dynamicParams = false;

export function generateStaticParams() {
  return WEBSITE_TEMPLATES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const template = getWebsiteTemplate(slug);
  if (!template) return {};
  return {
    title: `${template.name} website template`,
    description: `${template.summary} Preview all ${template.pageCount} pages on desktop, tablet and phone.`,
    alternates: { canonical: `/templates/${template.slug}` },
  };
}

export default async function WebsiteTemplatePreviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const template = getWebsiteTemplate(slug);
  if (!template) notFound();

  const siblings = WEBSITE_TEMPLATES.filter((t) => t.kind === template.kind && t.slug !== template.slug);
  const heroLinks = [
    { ...PRODUCT_LINKS[template.kind], cta: "Explore" },
    ...siblings.map((t) => ({
      href: `/templates/${t.slug}`,
      title: t.name,
      description: t.summary,
      cta: "Preview",
    })),
  ];

  return (
    <>
      {/* Dark band: /templates is a Storefront path, so the site header is transparent with light text here. */}
      <header className="relative isolate overflow-hidden border-b border-white/5 bg-[#04140f] px-6 pb-16 pt-36 md:pb-20">
        <div className="pointer-events-none absolute inset-0 z-0" style={HERO_GRID_STYLE} aria-hidden />
        <div
          className="pointer-events-none absolute -top-16 right-[8%] z-0 h-[360px] w-[360px] rounded-full blur-[100px]"
          style={{ background: "rgb(var(--xyvoo-teal-product-rgb, 77 208 196) / 0.24)" }}
          aria-hidden
        />
        <div className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-1 gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="mb-5 text-eyebrow font-bold uppercase tracking-[0.22em]" style={{ color: "var(--xyvoo-teal-product)" }}>
              Website template · {template.industry}
            </p>
            <h1 className="text-balance text-h1 font-black leading-[1.08] tracking-tight text-white">{template.name}</h1>
            <p className="mt-6 max-w-md text-p leading-relaxed text-white/60">
              {template.summary}{" "}
              {template.kind === "hotel"
                ? "This is a working preview: click around, check availability and try the booking request. Nothing is booked."
                : "This is a working preview: click around, add things to the basket and try the checkout. Nothing is for sale."}
            </p>
          </div>

          <nav aria-label="Related" className="border-t border-white/10">
            {heroLinks.map((link) => (
              <Link key={link.href} href={link.href} className="group block border-b border-white/10 py-7">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-lg font-bold text-white">{link.title}</span>
                  <span
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-bold uppercase tracking-wider transition-colors group-hover:text-white"
                    style={{ color: "var(--xyvoo-teal-product)" }}
                  >
                    {link.cta}
                    <ArrowUpRight className="h-3 w-3" aria-hidden />
                  </span>
                </div>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/50">{link.description}</p>
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="bg-slate-50 pb-20 pt-6">
        <div className="mx-auto w-full max-w-[1200px] px-6">
          <TemplatePreviewer template={template} />

          <section
            className="mt-12 grid gap-8 rounded-2xl bg-white p-8 shadow-sm lg:grid-cols-[1fr_1.4fr]"
            aria-labelledby="included-title"
          >
            <div>
              <h2 id="included-title" className="text-h4 font-black text-xyvoo-navy">
                What&apos;s included
              </h2>
              <p className="mt-2 text-p text-xyvoo-navy/70">{template.description}</p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2">
              {template.highlights.map((h) => (
                <li key={h} className="flex items-start gap-2 text-sm text-xyvoo-navy/80">
                  <Check
                    className="mt-0.5 h-4 w-4 shrink-0"
                    style={{ color: "var(--xyvoo-teal-product-hover)" }}
                    aria-hidden
                  />
                  {h}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
