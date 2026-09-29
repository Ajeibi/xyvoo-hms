import type { CSSProperties } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ExternalLink, LayoutTemplate } from "lucide-react";
import { TemplateThumbnail } from "@/components/website/TemplateThumbnail";
import { XYVOO_AUTH_ROUTES } from "@/constants/auth-links";
import { WEBSITE_TEMPLATES } from "@/constants/website-templates";
import type { WebsiteTemplate } from "@/types";

/** Same static grid backdrop as the /solution/storefront hero. */
const HERO_GRID_STYLE: CSSProperties = {
  backgroundImage: `
      linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
    `,
  backgroundSize: "40px 40px",
};

function TemplateCard({ template }: { template: WebsiteTemplate }) {
  return (
    <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <TemplateThumbnail src={`${template.previewPath}/index.html`} title={`${template.name} home page`} />
      <div className="flex flex-1 flex-col gap-4 p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-xyvoo-navy/60">{template.industry}</p>
          <ul className="flex gap-1.5" aria-label="Colour palette">
            {template.palette.map((colour) => (
              <li key={colour} className="h-5 w-5 rounded-full border border-slate-300" style={{ background: colour }}>
                <span className="sr-only">{colour}</span>
              </li>
            ))}
          </ul>
        </div>
        <h3 className="text-h3 font-black text-xyvoo-navy">{template.name}</h3>
        <p className="text-p leading-relaxed text-xyvoo-navy/70">{template.description}</p>
        <ul className="grid gap-2 sm:grid-cols-2">
          {template.highlights.map((h) => (
            <li key={h} className="flex items-start gap-2 text-sm text-xyvoo-navy/80">
              <Check className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--xyvoo-teal-product-hover)" }} aria-hidden />
              {h}
            </li>
          ))}
        </ul>
        <p className="text-sm text-xyvoo-navy/60">{template.pageCount} ready-made pages</p>
        <div className="mt-auto flex flex-wrap gap-3 pt-2">
          <Link
            href={`/templates/${template.slug}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-bold text-xyvoo-navy transition-opacity hover:opacity-90"
            style={{ background: "var(--xyvoo-teal-product)" }}
          >
            Preview {template.name}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <a
            href={`${template.previewPath}/index.html`}
            target="_blank"
            rel="noopener"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-5 text-sm font-semibold text-xyvoo-navy transition-colors hover:border-slate-400"
          >
            Open full screen
            <ExternalLink className="h-4 w-4" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </div>
    </article>
  );
}

function CtaPanel({ title, text, href }: { title: string; text: string; href: string }) {
  return (
    <div className="mt-10 flex flex-col items-start gap-4 rounded-2xl bg-white p-8 shadow-sm md:flex-row md:items-center md:justify-between">
      <div>
        <h3 className="text-h4 font-black text-xyvoo-navy">{title}</h3>
        <p className="mt-2 max-w-2xl text-p text-xyvoo-navy/70">{text}</p>
      </div>
      <Link
        href={href}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-6 text-sm font-bold text-xyvoo-navy transition-opacity hover:opacity-90"
        style={{ background: "var(--xyvoo-teal-product)" }}
      >
        Get started
        <ArrowRight className="h-4 w-4" aria-hidden />
      </Link>
    </div>
  );
}

export default function WebsiteTemplatesPage() {
  const storefronts = WEBSITE_TEMPLATES.filter((t) => t.kind === "storefront");
  const hotels = WEBSITE_TEMPLATES.filter((t) => t.kind === "hotel");
  const heroLinks = [
    {
      href: "#storefronts",
      title: `Online shops (${storefronts.length})`,
      description: "Shop, basket, checkout and customer accounts in a full brand website.",
      cta: "View",
      Icon: ArrowDown,
    },
    {
      href: "#hotels",
      title: `Hotels and stays (${hotels.length})`,
      description: "Rooms, rates and a booking request journey that lands in your reservations inbox.",
      cta: "View",
      Icon: ArrowDown,
    },
    {
      href: "/solution/storefront",
      title: "XYVOO Storefront",
      description: "The catalogue, orders and payments that power every online shop template.",
      cta: "Explore",
      Icon: ArrowUpRight,
    },
    {
      href: "/solution/hms",
      title: "XYVOO HMS",
      description: "The reservations, rooms and front desk system behind every hotel template.",
      cta: "Explore",
      Icon: ArrowUpRight,
    },
  ];

  return (
    <>
      {/* Hero — same dense split layout as the Storefront/HMS landing pages */}
      <section className="relative isolate overflow-hidden border-b border-white/5 bg-[#04140f] px-6 pb-20 pt-36 md:pb-24">
        <div className="pointer-events-none absolute inset-0 z-0" style={HERO_GRID_STYLE} aria-hidden />
        <div
          className="pointer-events-none absolute -top-16 right-[8%] z-0 h-[360px] w-[360px] rounded-full blur-[100px]"
          style={{ background: "rgb(var(--xyvoo-teal-product-rgb, 77 208 196) / 0.24)" }}
          aria-hidden
        />
        <div className="relative z-10 mx-auto grid max-w-[1200px] grid-cols-1 gap-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div>
            <p className="mb-5 text-eyebrow font-bold uppercase tracking-[0.22em]" style={{ color: "var(--xyvoo-teal-product)" }}>
              Website templates
            </p>
            <h1 className="text-balance text-h1 font-black leading-[1.08] tracking-tight text-white">
              See what your website could look like.
            </h1>
            <p className="mt-6 max-w-md text-p leading-relaxed text-white/60">
              Every XYVOO website is a complete brand site, not just a catalogue or a booking engine.
              Click through a template exactly as your customers or guests would.
            </p>
          </div>

          <nav aria-label="Template types" className="border-t border-white/10">
            {heroLinks.map((link) => (
              <Link key={link.href} href={link.href} className="group block border-b border-white/10 py-7">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-lg font-bold text-white">{link.title}</span>
                  <span
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-bold uppercase tracking-wider transition-colors group-hover:text-white"
                    style={{ color: "var(--xyvoo-teal-product)" }}
                  >
                    {link.cta}
                    <link.Icon className="h-3 w-3" aria-hidden />
                  </span>
                </div>
                <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/50">{link.description}</p>
              </Link>
            ))}
          </nav>
        </div>
      </section>

      <section id="storefronts" className="scroll-mt-24 bg-slate-50 py-16 md:py-20" aria-labelledby="storefronts-title">
        <div className="mx-auto w-full max-w-[1200px] px-6">
          <div className="mb-8 max-w-2xl">
            <h2 id="storefronts-title" className="text-h2 font-black text-xyvoo-navy">Online shop templates</h2>
            <p className="mt-3 text-p text-xyvoo-navy/70">Shop, basket, checkout and customer accounts, wrapped in a full brand website. Runs on XYVOO Storefront.</p>
          </div>
          <ul className="grid gap-8 lg:grid-cols-2">
            {storefronts.map((template) => (
              <li key={template.slug}>
                <TemplateCard template={template} />
              </li>
            ))}
            <li>
              <div className="flex h-full min-h-72 flex-col items-start justify-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: "rgb(var(--xyvoo-mint-rgb) / 0.22)" }}>
                  <LayoutTemplate className="h-5 w-5" style={{ color: "var(--xyvoo-teal-product)" }} aria-hidden />
                </span>
                <h3 className="text-h4 font-black text-xyvoo-navy">More templates on the way</h3>
                <p className="max-w-md text-p leading-relaxed text-xyvoo-navy/70">
                  We&apos;re designing templates for fashion, food, gifts and more. Every one can be matched to your logo, colours and fonts.
                </p>
                <Link href="/contact" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-xyvoo-navy underline underline-offset-4">
                  Tell us what you sell
                </Link>
              </div>
            </li>
          </ul>
          <CtaPanel
            title="Your shop, your domain"
            text="Pick a starting point and we'll set it up with your products, logo and colours, running on XYVOO's catalogue, orders and payments."
            href={XYVOO_AUTH_ROUTES.storefront.register}
          />
        </div>
      </section>

      <section id="hotels" className="scroll-mt-24 bg-white py-16 md:py-20" aria-labelledby="hotels-title">
        <div className="mx-auto w-full max-w-[1200px] px-6">
          <div className="mb-8 max-w-2xl">
            <h2 id="hotels-title" className="text-h2 font-black text-xyvoo-navy">Hotel and stay templates</h2>
            <p className="mt-3 text-p text-xyvoo-navy/70">
              Rooms, availability, rates and a full booking journey. Guests send a booking request, your team gets an email and
              confirms it. No payment is taken online. Runs on XYVOO HMS.
            </p>
          </div>
          <ul className="grid gap-8 lg:grid-cols-2">
            {hotels.map((template) => (
              <li key={template.slug}>
                <TemplateCard template={template} />
              </li>
            ))}
          </ul>
          <CtaPanel
            title="Take bookings on your own website"
            text="Pick a template and we'll set it up with your rooms, rates and photos, sending every request straight to your reservations inbox."
            href={XYVOO_AUTH_ROUTES.hms.register}
          />
        </div>
      </section>
    </>
  );
}
