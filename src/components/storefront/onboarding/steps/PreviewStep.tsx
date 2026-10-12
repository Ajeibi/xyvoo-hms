"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, Home, ShoppingBag } from "lucide-react";
import type { StepProps } from "../OnboardingWizard";
import { StepActions } from "../fields";

type PageLink = { title: string; path: string };

/**
 * The store as customers will see it, in a frame, with every page of the
 * website one click away: the home page, the shop, and the About, Contact,
 * FAQs and policy pages written for the shop during setup. Store members see
 * the draft at /shop/<slug>; the public sees "opening soon" until it's published.
 */
export default function PreviewStep({ slug, busy, backHref, onSubmit }: StepProps<null>) {
  const base = `/shop/${slug}`;
  const [pages, setPages] = useState<PageLink[] | null>(null);
  const [current, setCurrent] = useState(base);

  useEffect(() => {
    let cancelled = false;
    // Makes sure the standard pages exist (they're normally written when contact details are saved), then lists them.
    fetch("/api/store/pages", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, defaults: true }) })
      .catch(() => undefined)
      .then(() => fetch(`/api/store/pages?slug=${encodeURIComponent(slug)}`))
      .then((r) => (r.ok ? r.json() : { pages: [] }))
      .then((data: { pages?: Array<{ title: string; slug: string }> }) => {
        if (!cancelled) setPages((data.pages ?? []).map((p) => ({ title: p.title, path: `${base}/pages/${p.slug}` })));
      })
      .catch(() => !cancelled && setPages([]));
    return () => {
      cancelled = true;
    };
  }, [slug, base]);

  const links: Array<PageLink & { icon: typeof Home }> = [
    { title: "Home page", path: base, icon: Home },
    { title: "Shop", path: `${base}/products`, icon: ShoppingBag },
    ...(pages ?? []).map((p) => ({ ...p, icon: FileText })),
  ];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({});
      }}
      className="space-y-6"
    >
      <section aria-labelledby="site-pages-title" className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 id="site-pages-title" className="text-base font-semibold text-slate-900">
          Your website
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {pages === null
            ? "Getting your pages ready…"
            : pages.length
              ? `Your shop has a full website: a home page, your shop and ${pages.length} pages we've written from your details. Choose one to see it.`
              : "Your home page and shop are ready. Add About, Contact and policy pages from Website, then Pages."}
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {links.map((l) => (
            <li key={l.path}>
              <button
                type="button"
                onClick={() => setCurrent(l.path)}
                aria-pressed={current === l.path}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue ${
                  current === l.path ? "border-blue-600 bg-blue-50 text-blue-800" : "border-slate-300 text-slate-700 hover:bg-slate-50"
                }`}
              >
                <l.icon className="h-3.5 w-3.5" aria-hidden />
                {l.title}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <iframe key={current} src={current} title="Preview of your website" className="h-[70vh] w-full bg-white" />
      </div>
      <ul className="space-y-2 text-sm text-slate-700">
        <li>Every page can be changed in Website, then Pages: the words, the pictures and what shows in your menus.</li>
        <li>Next, on your dashboard: add products, connect payments, then publish when you&rsquo;re ready.</li>
      </ul>
      <a href={current} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 underline-offset-2 hover:underline">
        Open this page in a new tab <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
      <StepActions busy={busy} backHref={backHref} submitLabel="Finish and go to my dashboard" />
    </form>
  );
}
