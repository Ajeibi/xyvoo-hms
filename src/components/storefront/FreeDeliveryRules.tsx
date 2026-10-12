"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Gift, Pencil, Plus, Trash2 } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import type { FreeDeliveryRule } from "@/lib/store/free-delivery";
import AreaPicker from "./AreaPicker";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashField, dashInput, DashPill, DashStatus, sendJson } from "./dashboard-ui";

/** A clear keyboard focus ring for buttons. */
const ring = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue";

function SkeletonRows() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="rounded-xl border border-slate-100 p-4">
          <div className="h-4 w-48 max-w-full animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
          <div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

type Option = { id: string; name: string };

type Draft = {
  id: string | null;
  name: string;
  isActive: boolean;
  areas: string[];
  minSubtotal: string;
  minItems: string;
  productIds: string[];
  collectionIds: string[];
  startDate: string;
  endDate: string;
  includeExtras: boolean;
};

const EMPTY: Draft = {
  id: null,
  name: "",
  isActive: true,
  areas: [],
  minSubtotal: "",
  minItems: "",
  productIds: [],
  collectionIds: [],
  startDate: "",
  endDate: "",
  includeExtras: false,
};

/** "2026-12-01" (the merchant's own day) → the start or end of that day as an instant. */
const dayStart = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : null);
const dayEnd = (d: string) => (d ? new Date(`${d}T23:59:59`).toISOString() : null);
const toDay = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const showDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** Delivery → Free delivery rules: as many as the shop likes, checked in order. */
export default function FreeDeliveryRules({ slug, currency, countryCode = "NG" }: { slug: string; currency: string; countryCode?: string }) {
  const [rules, setRules] = useState<FreeDeliveryRule[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [products, setProducts] = useState<Option[]>([]);
  const [collections, setCollections] = useState<Option[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const money = (v: number) => formatShopCurrency(v, currency);
  const nameRef = useRef<HTMLInputElement>(null);
  const formKey = draft ? (draft.id ?? "new") : null;

  // Take keyboard and screen reader users straight to the form when it opens.
  useEffect(() => {
    if (formKey) nameRef.current?.focus();
  }, [formKey]);

  const load = () =>
    fetch(`/api/store/delivery-free-rules?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((data) => {
        setRules(data.rules ?? []);
        setCanManage(Boolean(data.canManage));
      })
      .catch(() => setError("We couldn't load your free delivery rules. Please refresh the page."));

  useEffect(() => {
    void load();
    // Products and collections, to name them in rules and to choose from.
    fetch(`/api/store/products/list?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setProducts(((d.products ?? []) as Option[]).map((p) => ({ id: p.id, name: p.name }))))
      .catch(() => undefined);
    fetch(`/api/store/collections?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setCollections(((d.collections ?? []) as Option[]).map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => undefined);
    // Load once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const nameOf = (list: Option[], id: string) => list.find((o) => o.id === id)?.name ?? "a removed item";

  /** The rule's conditions in a sentence, e.g. "In Lagos, orders over ₦50,000, 1–31 Dec 2026". */
  const describe = (r: FreeDeliveryRule) => {
    const parts: string[] = [];
    if (r.areas.length) parts.push(`In ${r.areas.join(", ")}`);
    if (r.minSubtotal !== null) parts.push(`orders over ${money(r.minSubtotal)}`);
    if (r.minItems !== null) parts.push(`${r.minItems} or more items`);
    const things = [...r.collectionIds.map((id) => `${nameOf(collections, id)} (collection)`), ...r.productIds.map((id) => nameOf(products, id))];
    if (things.length) parts.push(`with ${things.length > 3 ? `${things.slice(0, 3).join(", ")} and ${things.length - 3} more` : things.join(" or ")}`);
    if (r.startsAt || r.endsAt) parts.push(r.startsAt && r.endsAt ? `${showDate(r.startsAt)} to ${showDate(r.endsAt)}` : r.startsAt ? `from ${showDate(r.startsAt)}` : `until ${showDate(r.endsAt!)}`);
    return parts.join(" · ");
  };

  const edit = (r: FreeDeliveryRule) => {
    setStatus("");
    setDraft({
      id: r.id,
      name: r.name,
      isActive: r.isActive,
      areas: r.areas,
      minSubtotal: r.minSubtotal === null ? "" : String(r.minSubtotal),
      minItems: r.minItems === null ? "" : String(r.minItems),
      productIds: r.productIds,
      collectionIds: r.collectionIds,
      startDate: toDay(r.startsAt),
      endDate: toDay(r.endsAt),
      includeExtras: r.includeExtras,
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setError("");
    setBusy(true);
    const body = {
      slug,
      name: draft.name,
      isActive: draft.isActive,
      areas: draft.areas,
      minSubtotal: draft.minSubtotal === "" ? null : draft.minSubtotal,
      minItems: draft.minItems === "" ? null : draft.minItems,
      productIds: draft.productIds,
      collectionIds: draft.collectionIds,
      startsAt: dayStart(draft.startDate),
      endsAt: dayEnd(draft.endDate),
      includeExtras: draft.includeExtras,
    };
    try {
      await sendJson(draft.id ? `/api/store/delivery-free-rules/${draft.id}` : "/api/store/delivery-free-rules", draft.id ? "PATCH" : "POST", body);
      setStatus(`“${draft.name}” saved.`);
      setDraft(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: FreeDeliveryRule) => {
    if (!window.confirm(`Remove “${r.name}”? Delivery will no longer be free under this rule.`)) return;
    setError("");
    try {
      await sendJson(`/api/store/delivery-free-rules/${r.id}?slug=${encodeURIComponent(slug)}`, "DELETE");
      setStatus(`“${r.name}” removed.`);
      if (draft?.id === r.id) setDraft(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const move = async (r: FreeDeliveryRule, direction: "up" | "down") => {
    try {
      await sendJson(`/api/store/delivery-free-rules/${r.id}`, "PATCH", { slug, move: direction });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const shownProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return (q ? products.filter((p) => p.name.toLowerCase().includes(q)) : products).slice(0, 50);
  }, [products, productSearch]);

  const toggle = (key: "productIds" | "collectionIds", id: string) =>
    draft && setDraft({ ...draft, [key]: draft[key].includes(id) ? draft[key].filter((x) => x !== id) : [...draft[key], id] });


  const startNew = () => {
    setStatus("");
    setDraft(EMPTY);
  };

  const onCount = rules?.filter((r) => r.isActive).length ?? 0;
  const summary =
    rules === null || rules.length === 0
      ? null
      : onCount === 0
        ? "All your free delivery rules are switched off, so customers pay the usual delivery charge."
        : `${onCount} ${onCount === 1 ? "rule is" : "rules are"} on. Delivery is free when an order meets every condition in a rule, and rules are checked from the top.`;

  return (
    <DashCard
      id="free-rules"
      icon={Gift}
      title="Free delivery"
      description="Make delivery free in certain areas, on bigger orders, on chosen products or for a set time."
      actions={
        canManage && !draft && rules?.length ? (
          <button type="button" onClick={startNew} className={`${dashButton.primary} ${ring}`}>
            <Plus className="h-4 w-4" aria-hidden /> Add a rule
          </button>
        ) : null
      }
    >
      {/* Always in the page so screen readers announce changes to it. */}
      <DashStatus message={status} />
      <div className={`space-y-4 ${status ? "mt-3" : ""}`}>
        <DashAlert message={error} />
        {summary ? <p className={`text-sm ${onCount === 0 ? "text-amber-800" : "text-slate-700"}`}>{summary}</p> : null}

        {rules === null ? (
          <>
            <p className="sr-only" role="status">
              Loading your free delivery rules
            </p>
            <SkeletonRows />
          </>
        ) : rules.length === 0 ? (
          draft ? null : (
            <DashEmptyState
              icon={Gift}
              title="No free delivery yet"
              description="Add a rule to offer free delivery in an area, on bigger orders, on certain products or during a sale."
              action={
                canManage ? (
                  <button type="button" onClick={startNew} className={`${dashButton.primary} ${ring}`}>
                    <Plus className="h-4 w-4" aria-hidden /> Add a rule
                  </button>
                ) : null
              }
            />
          )
        ) : (
          <ol className="space-y-3">
            {rules.map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 p-4">
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-900">{r.name}</span>
                    {r.isActive ? <DashPill tone="green">On</DashPill> : <DashPill>Off</DashPill>}
                  </p>
                  <p className="mt-1 break-words text-slate-600">
                    {describe(r)}
                    {r.includeExtras ? " · includes bulky item charges" : ""}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => move(r, "up")}
                      disabled={i === 0}
                      className={`rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30 ${ring}`}
                      aria-label={`Move ${r.name} up`}
                    >
                      <ArrowUp className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(r, "down")}
                      disabled={i === rules.length - 1}
                      className={`rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-30 ${ring}`}
                      aria-label={`Move ${r.name} down`}
                    >
                      <ArrowDown className="h-4 w-4" aria-hidden />
                    </button>
                    <button type="button" onClick={() => edit(r)} className={`${dashButton.quiet} ${ring}`}>
                      <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit<span className="sr-only"> {r.name}</span>
                    </button>
                    <button type="button" onClick={() => remove(r)} className={`${dashButton.danger} ${ring}`}>
                      <Trash2 className="h-3.5 w-3.5" aria-hidden /> Remove<span className="sr-only"> {r.name}</span>
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        )}

        {draft ? (
          <form onSubmit={save} className="space-y-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4 sm:p-5" noValidate aria-labelledby="free-rule-form-title">
            <h3 id="free-rule-form-title" className="text-base font-semibold text-slate-900">
              {draft.id ? `Edit “${draft.name}”` : "New free delivery rule"}
            </h3>
            <DashField id="rule-name" label="Name customers see" hint="Shown at checkout when it applies, for example “Free delivery in Lagos” or “Free delivery this weekend”.">
              <input ref={nameRef} id="rule-name" className={dashInput} value={draft.name} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-describedby="rule-name-hint" />
            </DashField>

            <fieldset className="space-y-4">
              <legend className="text-sm font-semibold text-slate-900">Conditions</legend>
              <p className="text-sm text-slate-600">Fill in only the ones you need. An order has to meet all of them.</p>

              <fieldset className="space-y-2 rounded-xl border border-slate-200 bg-white p-4">
                <legend className="px-1 text-sm font-medium text-slate-800">
                  Where <span className="font-normal text-slate-500">(optional)</span>
                </legend>
                <p className="text-sm text-slate-600">Only for addresses in these places. Choose nothing for anywhere.</p>
                <AreaPicker id="rule-areas" countryCode={countryCode} value={draft.areas} onChange={(areas) => setDraft((d) => (d ? { ...d, areas } : d))} />
              </fieldset>

              <div className="grid gap-4 sm:grid-cols-2">
                <DashField id="rule-min-total" label={`Order total of at least (${currency})`} optional>
                  <input id="rule-min-total" className={dashInput} inputMode="decimal" value={draft.minSubtotal} onChange={(e) => setDraft({ ...draft, minSubtotal: e.target.value.replace(/[^0-9.]/g, "") })} />
                </DashField>
                <DashField id="rule-min-items" label="At least this many items" optional>
                  <input id="rule-min-items" className={dashInput} inputMode="numeric" value={draft.minItems} onChange={(e) => setDraft({ ...draft, minItems: e.target.value.replace(/\D/g, "") })} />
                </DashField>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <DashField id="rule-start" label="From" optional>
                  <input id="rule-start" type="date" className={dashInput} value={draft.startDate} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
                </DashField>
                <DashField id="rule-end" label="Until (inclusive)" optional>
                  <input id="rule-end" type="date" className={dashInput} value={draft.endDate} min={draft.startDate || undefined} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
                </DashField>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-sm font-medium text-slate-800">
                  Only when the basket has <span className="font-normal text-slate-500">(optional, any one of these)</span>
                </legend>
                {collections.length ? (
                  <div className="flex flex-wrap gap-2">
                    {collections.map((c) => (
                      <label key={c.id} className={`flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${draft.collectionIds.includes(c.id) ? "border-xyvoo-blue bg-blue-50" : "border-slate-300"}`}>
                        <input type="checkbox" checked={draft.collectionIds.includes(c.id)} onChange={() => toggle("collectionIds", c.id)} className="h-4 w-4" />
                        {c.name} <span className="text-xs text-slate-500">collection</span>
                      </label>
                    ))}
                  </div>
                ) : null}
                <label htmlFor="rule-product-search" className="sr-only">
                  Search products
                </label>
                <input id="rule-product-search" className={dashInput} placeholder="Search your products" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
                <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {shownProducts.length ? (
                    shownProducts.map((p) => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                        <input type="checkbox" checked={draft.productIds.includes(p.id)} onChange={() => toggle("productIds", p.id)} className="h-4 w-4" />
                        {p.name}
                      </label>
                    ))
                  ) : (
                    <p className="px-2 py-1.5 text-sm text-slate-500">{products.length ? "No products match." : "No products yet."}</p>
                  )}
                </div>
                {draft.productIds.length || draft.collectionIds.length ? (
                  <p className="text-xs text-slate-600">
                    {draft.productIds.length} {draft.productIds.length === 1 ? "product" : "products"} and {draft.collectionIds.length}{" "}
                    {draft.collectionIds.length === 1 ? "collection" : "collections"} chosen.
                  </p>
                ) : null}
              </fieldset>
            </fieldset>

            <label className="flex items-start gap-3 text-sm text-slate-800">
              <input type="checkbox" checked={draft.includeExtras} onChange={(e) => setDraft({ ...draft, includeExtras: e.target.checked })} className="mt-0.5 h-4 w-4" />
              <span>
                Also waive extra charges on bulky products
                <span className="block text-xs text-slate-500">Otherwise customers still pay a product&rsquo;s own extra delivery charge.</span>
              </span>
            </label>
            <label className="flex items-center gap-3 text-sm text-slate-800">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} className="h-4 w-4" />
              This rule is on
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={busy} className={`${dashButton.primary} ${ring}`}>
                {busy ? "Saving…" : "Save rule"}
              </button>
              <button type="button" onClick={() => setDraft(null)} className={`${dashButton.secondary} ${ring}`}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </DashCard>
  );
}
