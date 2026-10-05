"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { MENU_LINK_TYPES, type SiteNavigation } from "@/lib/store/site/schema";
import { DashAlert, dashInput } from "../../dashboard-ui";
import type { TabProps } from "../WebsiteEditor";

type MenuItem = SiteNavigation["header"][number];

const TYPE_LABELS: Record<MenuItem["type"], string> = {
  home: "Home page",
  shop: "All products",
  collection: "A collection",
  product: "A product",
  page: "A page",
  url: "A web address",
};

function moveItem<T>(list: T[], i: number, dir: -1 | 1) {
  const next = [...list];
  [next[i], next[i + dir]] = [next[i + dir], next[i]];
  return next;
}

/** One menu link: its words and where it goes. */
function ItemEditor({ id, item, onChange, state }: { id: string; item: MenuItem; onChange: (item: MenuItem) => void; state: TabProps["state"] }) {
  const targetOptions =
    item.type === "page"
      ? state.pages.map((p) => ({ value: p.slug, label: `${p.title}${p.status === "draft" ? " (draft, hidden until published)" : ""}` }))
      : item.type === "collection"
        ? state.collections.map((c) => ({ value: c.slug, label: c.name }))
        : item.type === "product"
          ? state.products.map((p) => ({ value: p.slug, label: p.name }))
          : [];

  return (
    <div className="grid flex-1 gap-2 sm:grid-cols-3">
      <div>
        <label htmlFor={`${id}-label`} className="sr-only">
          Link text
        </label>
        <input id={`${id}-label`} className={dashInput} maxLength={40} value={item.label} onChange={(e) => onChange({ ...item, label: e.target.value })} placeholder="Link text" />
      </div>
      <div>
        <label htmlFor={`${id}-type`} className="sr-only">
          Links to
        </label>
        <select id={`${id}-type`} className={dashInput} value={item.type} onChange={(e) => onChange({ ...item, type: e.target.value as MenuItem["type"], target: "" })}>
          {MENU_LINK_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      {item.type === "url" ? (
        <div>
          <label htmlFor={`${id}-target`} className="sr-only">
            Web address
          </label>
          <input id={`${id}-target`} className={dashInput} value={item.target} onChange={(e) => onChange({ ...item, target: e.target.value })} placeholder="https://… or /products" />
        </div>
      ) : targetOptions.length || ["page", "collection", "product"].includes(item.type) ? (
        <div>
          <label htmlFor={`${id}-target`} className="sr-only">
            Which one
          </label>
          <select id={`${id}-target`} className={dashInput} value={item.target} onChange={(e) => onChange({ ...item, target: e.target.value })}>
            <option value="">{targetOptions.length ? "Choose…" : "None yet"}</option>
            {targetOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <span />
      )}
    </div>
  );
}

function ItemList({ prefix, items, onChange, state }: { prefix: string; items: MenuItem[]; onChange: (items: MenuItem[]) => void; state: TabProps["state"] }) {
  return (
    <ol className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2">
          <ItemEditor id={`${prefix}-${i}`} item={item} state={state} onChange={(next) => onChange(items.map((x, j) => (j === i ? next : x)))} />
          <div className="flex shrink-0 gap-1 pt-1.5">
            <button type="button" disabled={i === 0} onClick={() => onChange(moveItem(items, i, -1))} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
              <ArrowUp className="h-4 w-4" aria-hidden />
              <span className="sr-only">Move “{item.label}” up</span>
            </button>
            <button type="button" disabled={i === items.length - 1} onClick={() => onChange(moveItem(items, i, 1))} className="rounded p-1 text-slate-600 hover:bg-slate-100 disabled:opacity-30">
              <ArrowDown className="h-4 w-4" aria-hidden />
              <span className="sr-only">Move “{item.label}” down</span>
            </button>
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="rounded p-1 text-slate-600 hover:bg-red-50 hover:text-red-700">
              <Trash2 className="h-4 w-4" aria-hidden />
              <span className="sr-only">Remove “{item.label}”</span>
            </button>
          </div>
        </li>
      ))}
    </ol>
  );
}

function problems(nav: SiteNavigation) {
  const all = [...nav.header, ...nav.footer.flatMap((c) => c.items)];
  if (all.some((i) => !i.label.trim())) return "Every link needs some text.";
  if (all.some((i) => ["page", "collection", "product"].includes(i.type) && !i.target)) return "Choose where each link goes.";
  if (all.some((i) => i.type === "url" && !i.target.startsWith("/") && !/^https:\/\//.test(i.target))) return "Web addresses must start with https:// or /.";
  if (nav.footer.some((c) => !c.title.trim())) return "Every footer column needs a heading.";
  return "";
}

/** Header and footer menus. Links to pages that aren't published yet are hidden from customers until they are. */
export default function NavigationTab({ state, saving, saveDraft }: TabProps) {
  const [nav, setNav] = useState<SiteNavigation>(state.resolved.navigation);
  const [problem, setProblem] = useState("");

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const p = problems(nav);
        setProblem(p);
        if (!p) void saveDraft({ patch: { navigation: nav } });
      }}
    >
      <DashAlert message={problem} />
      <section aria-labelledby="nav-header-title" className="space-y-3">
        <h2 id="nav-header-title" className="text-base font-semibold text-slate-900">
          Top menu
        </h2>
        <p className="text-xs text-slate-500">“All products” opens a list of your categories when you have more than one.</p>
        <ItemList prefix="nav-h" items={nav.header} state={state} onChange={(header) => setNav({ ...nav, header })} />
        {nav.header.length < 8 ? (
          <button type="button" onClick={() => setNav({ ...nav, header: [...nav.header, { label: "New link", type: "page", target: "" }] })} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
            <Plus className="h-4 w-4" aria-hidden /> Add a link
          </button>
        ) : null}
      </section>

      <section aria-labelledby="nav-footer-title" className="space-y-3">
        <h2 id="nav-footer-title" className="text-base font-semibold text-slate-900">
          Footer menus
        </h2>
        {nav.footer.map((col, c) => (
          <fieldset key={c} className="space-y-2 rounded-xl border border-slate-200 p-3">
            <legend className="sr-only">Footer column {c + 1}</legend>
            <div className="flex items-center gap-2">
              <label htmlFor={`nav-f-${c}-title`} className="text-sm font-medium text-slate-800">
                Heading
              </label>
              <input id={`nav-f-${c}-title`} className={dashInput} maxLength={40} value={col.title} onChange={(e) => setNav({ ...nav, footer: nav.footer.map((x, j) => (j === c ? { ...x, title: e.target.value } : x)) })} />
              <button type="button" onClick={() => setNav({ ...nav, footer: nav.footer.filter((_, j) => j !== c) })} className="shrink-0 rounded p-1 text-slate-600 hover:bg-red-50 hover:text-red-700">
                <Trash2 className="h-4 w-4" aria-hidden />
                <span className="sr-only">Remove the “{col.title}” column</span>
              </button>
            </div>
            <ItemList prefix={`nav-f-${c}`} items={col.items} state={state} onChange={(items) => setNav({ ...nav, footer: nav.footer.map((x, j) => (j === c ? { ...x, items } : x)) })} />
            {col.items.length < 8 ? (
              <button
                type="button"
                onClick={() => setNav({ ...nav, footer: nav.footer.map((x, j) => (j === c ? { ...x, items: [...x.items, { label: "New link", type: "page", target: "" }] } : x)) })}
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
              >
                <Plus className="h-4 w-4" aria-hidden /> Add a link
              </button>
            ) : null}
          </fieldset>
        ))}
        {nav.footer.length < 4 ? (
          <button type="button" onClick={() => setNav({ ...nav, footer: [...nav.footer, { title: "New column", items: [] }] })} className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline">
            <Plus className="h-4 w-4" aria-hidden /> Add a footer column
          </button>
        ) : null}
        <label className="flex items-center gap-2 text-sm text-slate-800">
          <input type="checkbox" checked={nav.showSocialIcons} onChange={(e) => setNav({ ...nav, showSocialIcons: e.target.checked })} />
          Show social media icons (set the links in Settings)
        </label>
      </section>

      <button type="submit" disabled={saving} className="rounded-xl bg-xyvoo-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
        {saving ? "Saving…" : "Save menus"}
      </button>
    </form>
  );
}
