"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ImagePlus, Layers, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { slugifyCollectionName, type CollectionSummary } from "@/lib/store/collections";
import { DashAlert, DashField, dashInput, DashStatus, sendJson } from "./dashboard-ui";

type ProductOption = { id: string; name: string; status: string; imageUrl: string | null; category: string | null };
type Draft = Omit<CollectionSummary, "id"> & { id: string | null; slugTouched: boolean };

const EMPTY: Draft = { id: null, name: "", slug: "", description: "", imageUrl: null, imageAlt: "", isVisible: true, productIds: [], slugTouched: false };

/** Collections: hand-picked groups of products with their own page on the shop. */
export default function CollectionsManager({ slug }: { slug: string }) {
  const [collections, setCollections] = useState<CollectionSummary[] | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = () =>
    Promise.all([
      fetch(`/api/store/collections?slug=${encodeURIComponent(slug)}`).then((r) => r.json()),
      fetch(`/api/store/products/list?slug=${encodeURIComponent(slug)}`).then((r) => r.json()),
    ])
      .then(([c, p]) => {
        setCollections(c.collections ?? []);
        setCanManage(Boolean(c.canManage));
        setProducts(((p.products ?? []) as ProductOption[]).map(({ id, name, status, imageUrl, category }) => ({ id, name, status, imageUrl, category })));
      })
      .catch(() => setError("We couldn't load your collections. Please refresh the page."));

  useEffect(() => {
    void load();
    // Load once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  const productName = useMemo(() => new Map(products.map((p) => [p.id, p.name])), [products]);
  const filtered = products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));

  const toggleProduct = (id: string) =>
    setDraft((d) => (d ? { ...d, productIds: d.productIds.includes(id) ? d.productIds.filter((x) => x !== id) : [...d.productIds, id] } : d));

  const upload = async (file: File) => {
    setUploading(true);
    setError("");
    try {
      const form = new FormData();
      form.append("slug", slug);
      form.append("file", file);
      const res = await fetch("/api/store/products/upload-image", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || "We couldn't upload that image.");
      setDraft((d) => (d ? { ...d, imageUrl: data.url } : d));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setError("");
    if (draft.imageUrl && !draft.imageAlt.trim()) return setError("Describe the cover image for people who can't see it.");
    setBusy(true);
    const body = {
      slug,
      collectionSlug: draft.slug,
      name: draft.name,
      description: draft.description,
      imageUrl: draft.imageUrl,
      imageAlt: draft.imageAlt,
      isVisible: draft.isVisible,
      productIds: draft.productIds,
    };
    try {
      await sendJson(draft.id ? `/api/store/collections/${draft.id}` : "/api/store/collections", draft.id ? "PATCH" : "POST", body);
      setStatus(`“${draft.name}” saved.`);
      setDraft(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (c: CollectionSummary) => {
    if (!window.confirm(`Delete the “${c.name}” collection? Its products stay in your shop.`)) return;
    try {
      await sendJson(`/api/store/collections/${c.id}?slug=${encodeURIComponent(slug)}`, "DELETE");
      setStatus(`“${c.name}” deleted.`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <DashAlert message={error} />
      <DashStatus message={status} />

      <section aria-labelledby="collections-title" className="rounded-2xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 id="collections-title" className="text-base font-semibold text-slate-900">
            Your collections
          </h2>
          {canManage && !draft ? (
            <button type="button" onClick={() => setDraft(EMPTY)} className="inline-flex items-center gap-2 rounded-xl bg-xyvoo-blue px-4 py-2 text-sm font-semibold text-white">
              <Plus className="h-4 w-4" aria-hidden /> New collection
            </button>
          ) : null}
        </div>
        {collections === null ? (
          <p className="px-6 py-4 text-sm text-slate-500">Loading…</p>
        ) : collections.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <Layers className="mx-auto h-8 w-8 text-slate-300" aria-hidden />
            <p className="mt-2 text-sm text-slate-600">No collections yet. Until you add some, your shop groups products by category.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {collections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
                <div className="text-sm">
                  <p className="font-medium text-slate-900">
                    {c.name} {!c.isVisible ? <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">Hidden</span> : null}
                  </p>
                  <p className="text-slate-600">
                    {c.productIds.length} {c.productIds.length === 1 ? "product" : "products"} · /collections/{c.slug}
                  </p>
                </div>
                <div className="flex gap-2">
                  <a href={`/shop/${slug}/collections/${c.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden /> View<span className="sr-only"> {c.name} (opens in a new tab)</span>
                  </a>
                  {canManage ? (
                    <>
                      <button type="button" onClick={() => setDraft({ ...c, slugTouched: true })} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100">
                        <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit<span className="sr-only"> {c.name}</span>
                      </button>
                      <button type="button" onClick={() => remove(c)} className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm text-slate-700 hover:bg-red-50 hover:text-red-700">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden /> Delete<span className="sr-only"> {c.name}</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {draft ? (
        <form onSubmit={save} className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6" noValidate aria-labelledby="collection-form-title">
          <h2 id="collection-form-title" className="text-base font-semibold text-slate-900">
            {draft.id ? `Edit “${draft.name}”` : "New collection"}
          </h2>
          <DashField id="collection-name" label="Name">
            <input
              id="collection-name"
              className={dashInput}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value, slug: draft.slugTouched ? draft.slug : slugifyCollectionName(e.target.value) })}
            />
          </DashField>
          <DashField id="collection-slug" label="Web address" hint={`Your shop shows it at /collections/${draft.slug || "…"}`}>
            <input
              id="collection-slug"
              className={dashInput}
              value={draft.slug}
              onChange={(e) => setDraft({ ...draft, slug: slugifyCollectionName(e.target.value), slugTouched: true })}
              aria-describedby="collection-slug-hint"
              spellCheck={false}
            />
          </DashField>
          <DashField id="collection-description" label="Description" optional>
            <textarea id="collection-description" className={dashInput} rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
          </DashField>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-800">
              Cover image <span className="font-normal text-slate-500">(optional)</span>
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {draft.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- dashboard preview of an upload
                <img src={draft.imageUrl} alt="" className="h-16 w-24 rounded-lg border border-slate-200 object-cover" />
              ) : null}
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 focus-within:ring-2 focus-within:ring-xyvoo-blue hover:bg-slate-50">
                <ImagePlus className="h-4 w-4" aria-hidden />
                {uploading ? "Uploading…" : draft.imageUrl ? "Replace image" : "Upload an image"}
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              </label>
              {draft.imageUrl ? (
                <button type="button" onClick={() => setDraft({ ...draft, imageUrl: null, imageAlt: "" })} className="text-sm text-slate-600 hover:text-red-700">
                  Remove image
                </button>
              ) : null}
            </div>
            {draft.imageUrl ? (
              <DashField id="collection-image-alt" label="Describe the image" hint="Read aloud to customers who use screen readers, e.g. “Three linen cushions on a grey sofa”.">
                <input id="collection-image-alt" className={dashInput} value={draft.imageAlt} onChange={(e) => setDraft({ ...draft, imageAlt: e.target.value })} aria-describedby="collection-image-alt-hint" />
              </DashField>
            ) : null}
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-800">
              Products <span className="font-normal text-slate-500">({draft.productIds.length} chosen, shown in the order you tick them)</span>
            </legend>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <label htmlFor="collection-search" className="sr-only">
                Search products
              </label>
              <input id="collection-search" className={`${dashInput} pl-9`} placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
              {filtered.length === 0 ? <li className="px-4 py-3 text-sm text-slate-500">No products match.</li> : null}
              {filtered.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                    <input type="checkbox" checked={draft.productIds.includes(p.id)} onChange={() => toggleProduct(p.id)} className="h-4 w-4" />
                    <span className="flex-1 text-slate-900">{p.name}</span>
                    {p.status !== "active" ? <span className="text-xs text-slate-500">{p.status === "draft" ? "Draft" : "Archived"}</span> : null}
                  </label>
                </li>
              ))}
            </ul>
            {draft.productIds.length ? (
              <p className="text-xs text-slate-500">Order: {draft.productIds.map((id) => productName.get(id) ?? "Unknown product").join(", ")}</p>
            ) : null}
          </fieldset>

          <label className="flex items-center gap-3 text-sm text-slate-800">
            <input type="checkbox" checked={draft.isVisible} onChange={(e) => setDraft({ ...draft, isVisible: e.target.checked })} className="h-4 w-4" />
            Show this collection on the shop
          </label>
          <div className="flex gap-3">
            <button type="submit" disabled={busy || uploading} className="rounded-xl bg-xyvoo-blue px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? "Saving…" : "Save collection"}
            </button>
            <button type="button" onClick={() => setDraft(null)} className="text-sm font-medium text-slate-600 hover:underline">
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
