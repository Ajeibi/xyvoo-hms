"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, FileText, Plus, Sparkles, Trash2 } from "lucide-react";
import { pageSchema, STARTER_PAGES, SYSTEM_PAGE_KEYS, type PageBlock, type StorePage } from "@/lib/store/pages";
import { slugifyCollectionName } from "@/lib/store/collections";
import { DashAlert, DashField, dashButton, dashInput, sendJson } from "../../dashboard-ui";
import ImagePicker from "../ImagePicker";
import type { TabProps } from "../WebsiteEditor";

const BLOCK_LABELS: Record<PageBlock["type"], string> = {
  hero: "Page top (big heading and picture)",
  split: "Story with pictures",
  steps: "Numbered points",
  cta: "Call to action",
  contact_form: "Contact form",
  heading: "Heading",
  text: "Paragraphs",
  list: "Bullet list",
  faq: "Questions and answers",
  contact: "Your contact details",
};

function newBlock(type: PageBlock["type"]): PageBlock {
  switch (type) {
    case "hero":
      return { type, eyebrow: "", heading: "New heading", lead: "", image: null };
    case "split":
      return { type, eyebrow: "", heading: "New section", text: "", images: [], imageSide: "left" };
    case "steps":
      return { type, eyebrow: "", heading: "", items: [{ title: "", text: "" }] };
    case "cta":
      return { type, heading: "Find something you'll love", text: "", buttons: [{ label: "Shop now", link: "shop" }] };
    case "contact_form":
      return { type, heading: "Send us a message", intro: "", hours: "", replyTime: "within one working day" };
    case "heading":
      return { type, text: "New heading" };
    case "text":
      return { type, text: "" };
    case "list":
      return { type, items: [""] };
    case "faq":
      return { type, items: [{ question: "", answer: "" }] };
    case "contact":
      return { type };
  }
}

type LinkOption = { value: string; label: string };

/** A short labelled text box used by the richer sections. */
function Text({ id, label, value, onChange, max, hint, area = false }: { id: string; label: string; value: string; onChange: (v: string) => void; max: number; hint?: string; area?: boolean }) {
  return (
    <DashField id={id} label={label} hint={hint}>
      {area ? (
        <textarea id={id} className={dashInput} rows={4} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} />
      ) : (
        <input id={id} className={dashInput} maxLength={max} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? `${id}-hint` : undefined} />
      )}
    </DashField>
  );
}

function BlockEditor({ id, block, onChange, slug, links }: { id: string; block: PageBlock; onChange: (b: PageBlock) => void; slug: string; links: LinkOption[] }) {
  switch (block.type) {
    case "hero":
      return (
        <div className="space-y-3">
          <Text id={`${id}-eyebrow`} label="Small line above the heading (optional)" value={block.eyebrow} max={60} onChange={(v) => onChange({ ...block, eyebrow: v })} />
          <Text id={`${id}-heading`} label="Heading" value={block.heading} max={120} onChange={(v) => onChange({ ...block, heading: v })} />
          <Text id={`${id}-lead`} label="Introduction (optional)" value={block.lead} max={400} area onChange={(v) => onChange({ ...block, lead: v })} />
          <ImagePicker
            id={`${id}-image`}
            label="Picture (optional)"
            slug={slug}
            url={block.image?.url ?? null}
            onChange={(url) => onChange({ ...block, image: url ? { url, alt: block.image?.alt ?? "" } : null })}
            alt={block.image?.alt ?? ""}
            onAltChange={(alt) => onChange({ ...block, image: block.image ? { ...block.image, alt } : null })}
          />
        </div>
      );
    case "split":
      return (
        <div className="space-y-3">
          <Text id={`${id}-eyebrow`} label="Small line above the heading (optional)" value={block.eyebrow} max={60} onChange={(v) => onChange({ ...block, eyebrow: v })} />
          <Text id={`${id}-heading`} label="Heading" value={block.heading} max={120} onChange={(v) => onChange({ ...block, heading: v })} />
          <Text id={`${id}-text`} label="Words" hint="Leave a blank line between paragraphs." value={block.text} max={3000} area onChange={(v) => onChange({ ...block, text: v })} />
          {[0, 1, 2].map((n) =>
            n <= block.images.length ? (
              <ImagePicker
                key={n}
                id={`${id}-image-${n}`}
                label={n === 0 ? "Main picture (optional)" : `Extra picture ${n} (optional)`}
                slug={slug}
                url={block.images[n]?.url ?? null}
                onChange={(url) => {
                  const images = [...block.images];
                  if (url) images[n] = { url, alt: images[n]?.alt ?? "" };
                  else images.splice(n, 1);
                  onChange({ ...block, images });
                }}
                alt={block.images[n]?.alt ?? ""}
                onAltChange={(alt) => onChange({ ...block, images: block.images.map((img, j) => (j === n ? { ...img, alt } : img)) })}
              />
            ) : null,
          )}
          <DashField id={`${id}-side`} label="Pictures on the">
            <select id={`${id}-side`} className={dashInput} value={block.imageSide} onChange={(e) => onChange({ ...block, imageSide: e.target.value as "left" | "right" })}>
              <option value="left">Left</option>
              <option value="right">Right</option>
            </select>
          </DashField>
        </div>
      );
    case "steps":
      return (
        <div className="space-y-3">
          <Text id={`${id}-eyebrow`} label="Small line above the heading (optional)" value={block.eyebrow} max={60} onChange={(v) => onChange({ ...block, eyebrow: v })} />
          <Text id={`${id}-heading`} label="Heading (optional)" value={block.heading} max={120} onChange={(v) => onChange({ ...block, heading: v })} />
          {block.items.map((item, i) => (
            <div key={i} className="space-y-1 rounded-lg bg-slate-50 p-2">
              <input aria-label={`Point ${i + 1} title`} className={dashInput} maxLength={80} value={item.title} placeholder="Title" onChange={(e) => onChange({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
              <textarea aria-label={`Point ${i + 1} words`} className={dashInput} rows={2} maxLength={400} value={item.text} placeholder="A sentence or two" onChange={(e) => onChange({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              {block.items.length > 1 ? (
                <button type="button" onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })} className="text-xs text-slate-600 hover:text-red-700">
                  Remove this point
                </button>
              ) : null}
            </div>
          ))}
          {block.items.length < 6 ? (
            <button type="button" onClick={() => onChange({ ...block, items: [...block.items, { title: "", text: "" }] })} className="text-sm font-medium text-blue-700 hover:underline">
              Add a point
            </button>
          ) : null}
        </div>
      );
    case "cta":
      return (
        <div className="space-y-3">
          <Text id={`${id}-heading`} label="Heading" value={block.heading} max={120} onChange={(v) => onChange({ ...block, heading: v })} />
          <Text id={`${id}-text`} label="A line underneath (optional)" value={block.text} max={300} onChange={(v) => onChange({ ...block, text: v })} />
          {block.buttons.map((button, i) => (
            <div key={i} className="grid gap-2 rounded-lg bg-slate-50 p-2 sm:grid-cols-2">
              <input aria-label={`Button ${i + 1} words`} className={dashInput} maxLength={40} value={button.label} onChange={(e) => onChange({ ...block, buttons: block.buttons.map((b, j) => (j === i ? { ...b, label: e.target.value } : b)) })} />
              <select aria-label={`Button ${i + 1} goes to`} className={dashInput} value={button.link} onChange={(e) => onChange({ ...block, buttons: block.buttons.map((b, j) => (j === i ? { ...b, link: e.target.value } : b)) })}>
                {links.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
              {block.buttons.length > 1 ? (
                <button type="button" onClick={() => onChange({ ...block, buttons: block.buttons.filter((_, j) => j !== i) })} className="text-left text-xs text-slate-600 hover:text-red-700">
                  Remove this button
                </button>
              ) : null}
            </div>
          ))}
          {block.buttons.length < 2 ? (
            <button type="button" onClick={() => onChange({ ...block, buttons: [...block.buttons, { label: "Contact us", link: links.find((l) => l.value === "page:contact")?.value ?? "home" }] })} className="text-sm font-medium text-blue-700 hover:underline">
              Add a second button
            </button>
          ) : null}
        </div>
      );
    case "contact_form":
      return (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Customers write to you here and the message comes to your shop&rsquo;s email. Your contact details from Settings show beside it.</p>
          <Text id={`${id}-heading`} label="Heading" value={block.heading} max={120} onChange={(v) => onChange({ ...block, heading: v })} />
          <Text id={`${id}-reply`} label="How quickly you reply (optional)" hint="Shown as “We reply within one working day.”" value={block.replyTime} max={80} onChange={(v) => onChange({ ...block, replyTime: v })} />
          <Text id={`${id}-hours`} label="Opening hours (optional)" hint="One line per day or group of days." value={block.hours} max={300} area onChange={(v) => onChange({ ...block, hours: v })} />
        </div>
      );
    case "heading":
      return <input id={id} aria-label="Heading text" className={dashInput} maxLength={120} value={block.text} onChange={(e) => onChange({ ...block, text: e.target.value })} />;
    case "text":
      return (
        <textarea
          id={id}
          aria-label="Paragraphs. Leave a blank line between paragraphs."
          className={dashInput}
          rows={5}
          maxLength={5000}
          value={block.text}
          onChange={(e) => onChange({ ...block, text: e.target.value })}
        />
      );
    case "list":
      return (
        <textarea
          id={id}
          aria-label="Bullet points, one per line"
          className={dashInput}
          rows={4}
          value={block.items.join("\n")}
          onChange={(e) => onChange({ ...block, items: e.target.value.split("\n").slice(0, 30) })}
        />
      );
    case "faq":
      return (
        <div className="space-y-2">
          {block.items.map((item, i) => (
            <div key={i} className="space-y-1 rounded-lg bg-slate-50 p-2">
              <input aria-label={`Question ${i + 1}`} className={dashInput} maxLength={200} value={item.question} placeholder="Question" onChange={(e) => onChange({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) })} />
              <textarea aria-label={`Answer ${i + 1}`} className={dashInput} rows={2} maxLength={2000} value={item.answer} placeholder="Answer" onChange={(e) => onChange({ ...block, items: block.items.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)) })} />
              {block.items.length > 1 ? (
                <button type="button" onClick={() => onChange({ ...block, items: block.items.filter((_, j) => j !== i) })} className="text-xs text-slate-600 hover:text-red-700">
                  Remove this question
                </button>
              ) : null}
            </div>
          ))}
          <button type="button" onClick={() => onChange({ ...block, items: [...block.items, { question: "", answer: "" }] })} className="text-sm font-medium text-blue-700 hover:underline">
            Add a question
          </button>
        </div>
      );
    case "contact":
      return <p className="text-sm text-slate-600">Shows the email, phone, WhatsApp and address from Settings, kept up to date automatically.</p>;
  }
}

/** Removes empty list lines before saving, so a trailing new line doesn't fail validation. */
function tidy(page: StorePage) {
  return {
    ...page,
    body: page.body.map((b) => (b.type === "list" ? { ...b, items: b.items.map((i) => i.trim()).filter(Boolean) } : b)),
  };
}

/** About, Contact, FAQs, policies and custom pages. Each page is published on its own. */
export default function PagesTab({ slug, refresh }: TabProps) {
  const [pages, setPages] = useState<StorePage[] | null>(null);
  const [editing, setEditing] = useState<StorePage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = () =>
    fetch(`/api/store/pages?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        setPages(data.pages);
      })
      .catch(() => setError("We couldn't load your pages."));

  useEffect(() => {
    void load();
    // Load once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const run = async (fn: () => Promise<unknown>, note: string) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      if (note) setStatus(note);
      await load();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const addStarter = (key: (typeof SYSTEM_PAGE_KEYS)[number]) =>
    run(() => sendJson("/api/store/pages", "POST", { slug, starter: key }), `“${STARTER_PAGES[key].title}” added as a draft. Edit it, then publish it.`);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const page = tidy(editing);
    const parsed = pageSchema.safeParse(page);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the page.");
      return;
    }
    const body = { slug, page: parsed.data };
    void run(
      () => (editing.id ? sendJson(`/api/store/pages/${editing.id}`, "PATCH", body) : sendJson("/api/store/pages", "POST", body)),
      editing.status === "published" ? `“${editing.title}” saved and published.` : `“${editing.title}” saved as a draft.`,
    ).then(() => setEditing(null));
  };

  const linkOptions: LinkOption[] = [
    { value: "shop", label: "The shop" },
    { value: "home", label: "The home page" },
    ...(pages ?? []).map((p) => ({ value: `page:${p.slug}`, label: `${p.title} page` })),
  ];

  const createDefaults = () =>
    run(async () => {
      const data = await sendJson("/api/store/pages", "POST", { slug, defaults: true });
      setStatus(data.added?.length ? `Added and published: ${data.added.join(", ")}. Edit any of them to make them your own.` : "You already have all the standard pages.");
    }, "");

  if (editing) {
    const moveBlock = (i: number, dir: -1 | 1) => {
      const body = [...editing.body];
      [body[i], body[i + dir]] = [body[i + dir], body[i]];
      setEditing({ ...editing, body });
    };
    return (
      <form onSubmit={save} className="space-y-4" noValidate>
        <button type="button" onClick={() => setEditing(null)} className="text-sm text-slate-600 hover:underline">
          ← All pages
        </button>
        <DashAlert message={error} />
        <DashField id="page-title" label="Title">
          <input
            id="page-title"
            className={dashInput}
            maxLength={80}
            value={editing.title}
            onChange={(e) => setEditing({ ...editing, title: e.target.value, slug: editing.id ? editing.slug : slugifyCollectionName(e.target.value) })}
          />
        </DashField>
        <DashField id="page-slug" label="Web address" hint={`Shown at /pages/${editing.slug || "…"}`}>
          <input id="page-slug" className={dashInput} value={editing.slug} onChange={(e) => setEditing({ ...editing, slug: slugifyCollectionName(e.target.value) })} aria-describedby="page-slug-hint" spellCheck={false} />
        </DashField>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-slate-800">Content</legend>
          <p className="text-xs text-slate-500">Replace anything in [square brackets] with your own words before publishing.</p>
          {editing.body.map((block, i) => (
            <div key={i} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{BLOCK_LABELS[block.type]}</span>
                <div className="flex gap-1">
                  <button type="button" disabled={i === 0} onClick={() => moveBlock(i, -1)} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
                    <ArrowUp className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Move {BLOCK_LABELS[block.type]} up</span>
                  </button>
                  <button type="button" disabled={i === editing.body.length - 1} onClick={() => moveBlock(i, 1)} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
                    <ArrowDown className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Move {BLOCK_LABELS[block.type]} down</span>
                  </button>
                  <button type="button" onClick={() => setEditing({ ...editing, body: editing.body.filter((_, j) => j !== i) })} className="rounded p-1 text-slate-600 hover:bg-red-50 hover:text-red-700">
                    <Trash2 className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Remove {BLOCK_LABELS[block.type]}</span>
                  </button>
                </div>
              </div>
              <BlockEditor id={`block-${i}`} block={block} slug={slug} links={linkOptions} onChange={(b) => setEditing({ ...editing, body: editing.body.map((x, j) => (j === i ? b : x)) })} />
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            {(Object.keys(BLOCK_LABELS) as PageBlock["type"][]).map((type) => (
              <button key={type} type="button" onClick={() => setEditing({ ...editing, body: [...editing.body, newBlock(type)] })} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-50">
                <Plus className="h-3 w-3" aria-hidden /> {BLOCK_LABELS[type]}
              </button>
            ))}
          </div>
        </fieldset>

        <details className="rounded-xl border border-slate-200 p-3">
          <summary className="cursor-pointer text-sm font-medium text-slate-800">Search engines (optional)</summary>
          <div className="mt-3 space-y-3">
            <DashField id="page-seo-title" label="Title in search results">
              <input id="page-seo-title" className={dashInput} maxLength={70} value={editing.seoTitle} onChange={(e) => setEditing({ ...editing, seoTitle: e.target.value })} />
            </DashField>
            <DashField id="page-seo-desc" label="Description in search results">
              <textarea id="page-seo-desc" className={dashInput} rows={2} maxLength={160} value={editing.seoDescription} onChange={(e) => setEditing({ ...editing, seoDescription: e.target.value })} />
            </DashField>
          </div>
        </details>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium text-slate-800">Visibility</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="page-status" checked={editing.status === "draft"} onChange={() => setEditing({ ...editing, status: "draft" })} /> Draft (only you can see it in the preview)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="page-status" checked={editing.status === "published"} onChange={() => setEditing({ ...editing, status: "published" })} /> Published (customers can see it)
          </label>
        </fieldset>

        <div className="flex gap-3">
          <button type="submit" disabled={busy} className="rounded-xl bg-xyvoo-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save page"}
          </button>
          <button type="button" onClick={() => setEditing(null)} className="text-sm text-slate-600 hover:underline">
            Cancel
          </button>
        </div>
      </form>
    );
  }

  const existingKeys = new Set((pages ?? []).map((p) => p.systemKey).filter(Boolean));
  const missingStarters = SYSTEM_PAGE_KEYS.filter((k) => !existingKeys.has(k));

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Pages are published on their own, straight away. Add them to your menus in the Menus tab.</p>
      <DashAlert message={error} />
      <p role="status" className="text-sm text-emerald-700">
        {status}
      </p>
      {pages === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {pages.length === 0 ? <li className="px-4 py-3 text-sm text-slate-500">No pages yet. Start with the suggestions below.</li> : null}
          {pages.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
              <div className="min-w-0 flex-1 text-sm">
                <p className="font-medium text-slate-900">{p.title}</p>
                <p className="text-slate-500">
                  /pages/{p.slug} · {p.status === "published" ? "Published" : "Draft"}
                </p>
              </div>
              <button type="button" onClick={() => setEditing(p)} className="text-sm font-medium text-blue-700 hover:underline">
                Edit<span className="sr-only"> {p.title}</span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => window.confirm(`Delete “${p.title}”? This can't be undone.`) && run(() => sendJson(`/api/store/pages/${p.id}?slug=${encodeURIComponent(slug)}`, "DELETE"), `“${p.title}” deleted.`)}
                className="text-sm text-slate-600 hover:text-red-700"
              >
                Delete<span className="sr-only"> {p.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {pages !== null && missingStarters.length >= 3 ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
          <p className="text-sm font-semibold text-slate-900">Give your shop a full website</p>
          <p className="mt-1 text-sm text-slate-700">
            We&rsquo;ll write About, Contact, FAQs, Delivery and returns, Privacy and Terms pages from your shop&rsquo;s details, with pictures of your products, and publish them. You can change every word.
          </p>
          <button type="button" disabled={busy} onClick={createDefaults} className={`${dashButton.primary} mt-3`}>
            <Sparkles className="h-4 w-4" aria-hidden /> {busy ? "Creating your pages…" : "Create my website pages"}
          </button>
        </div>
      ) : null}
      {pages !== null && missingStarters.length ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-800">Suggested pages (added as drafts with prompts to fill in)</p>
          <div className="flex flex-wrap gap-2">
            {missingStarters.map((k) => (
              <button key={k} type="button" disabled={busy} onClick={() => addStarter(k)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50 disabled:opacity-50">
                <Plus className="h-3.5 w-3.5" aria-hidden /> {STARTER_PAGES[k].title}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setEditing({ id: "", systemKey: null, title: "New page", slug: "new-page", body: [newBlock("text")], status: "draft", showInMenu: false, seoTitle: "", seoDescription: "" })}
        className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
      >
        <Plus className="h-4 w-4" aria-hidden /> Write a new page
      </button>
    </div>
  );
}
