"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, ImagePlus, Layers, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { slugifyCollectionName, type CollectionSummary } from "@/lib/store/collections";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashField, dashInput, DashPill, DashStatus, sendJson } from "./dashboard-ui";

type ProductOption = { id: string; name: string; status: string; imageUrl: string | null; category: string | null };
type Draft = Omit<CollectionSummary, "id"> & { id: string | null; slugTouched: boolean };

const EMPTY: Draft = { id: null, name: "", slug: "", description: "", imageUrl: null, imageAlt: "", isVisible: true, productIds: [], slugTouched: false };

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";
const pulse = "animate-pulse rounded bg-slate-100 motion-reduce:animate-none";
const rowButton = `inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 ${focusRing}`;

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

  const newButton = (label: string) => (
    <button type="button" onClick={() => setDraft(EMPTY)} className={`${dashButton.primary} ${focusRing}`}>
      <Plus className="h-4 w-4" aria-hidden /> {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <DashAlert message={error} />
      <DashStatus message={status} />

      <DashCard
        id="collections"
        icon={Layers}
        title="Your collections"
        description="Each collection gets its own page on your shop, so customers can find related products in one place."
        actions={canManage && !draft && collections?.length ? newButton("New collection") : null}
      >
        {collections === null ? (
          <>
            <p className="sr-only" role="status">
              Loading your collections
            </p>
            <ul className="divide-y divide-slate-100" aria-hidden>
              {Array.from({ length: 3 }, (_, i) => (
                <li key={i} className="space-y-2 py-4">
                  <div className={`h-4 w-40 max-w-full ${pulse}`} />
                  <div className={`h-3 w-56 max-w-full ${pulse}`} />
                </li>
              ))}
            </ul>
          </>
        ) : collections.length === 0 ? (
          <DashEmptyState
            icon={Layers}
            title="No collections yet"
            description="Your collections will be listed here. Until you add some, your shop groups products by category."
            action={canManage && !draft ? newButton("Create your first collection") : null}
          />
        ) : (
          <ul className="-my-1 divide-y divide-slate-100">
            {collections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0 text-sm">
                  <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                    <span className="break-words">{c.name}</span>
                    {c.isVisible ? <DashPill tone="green">On your shop</DashPill> : <DashPill>Hidden</DashPill>}
                  </p>
                  <p className="mt-0.5 break-all text-slate-600">
                    {c.productIds.length} {c.productIds.length === 1 ? "product" : "products"} · /collections/{c.slug}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <a href={`/shop/${slug}/collections/${c.slug}`} target="_blank" rel="noreferrer" className={rowButton}>
                    <ExternalLink className="h-4 w-4" aria-hidden /> View<span className="sr-only"> {c.name} (opens in a new tab)</span>
                  </a>
                  {canManage ? (
                    <>
                      <button type="button" onClick={() => setDraft({ ...c, slugTouched: true })} className={rowButton}>
                        <Pencil className="h-4 w-4" aria-hidden /> Edit<span className="sr-only"> {c.name}</span>
                      </button>
                      <button type="button" onClick={() => remove(c)} className={`${rowButton} hover:bg-red-50 hover:text-red-700`}>
                        <Trash2 className="h-4 w-4" aria-hidden /> Delete<span className="sr-only"> {c.name}</span>
                      </button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DashCard>

      {draft ? (
        <DashCard
          id="collection-form"
          icon={draft.id ? Pencil : Plus}
          title={draft.id ? `Edit “${draft.name}”` : "New collection"}
          description="Give it a clear name, pick the products, and choose whether it shows on your shop yet."
        >
          <form onSubmit={save} className="space-y-5" noValidate aria-labelledby="collection-form-title">
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
                <label className={`${dashButton.secondary} cursor-pointer focus-within:ring-2 focus-within:ring-xyvoo-blue focus-within:ring-offset-2`}>
                  <ImagePlus className="h-4 w-4" aria-hidden />
                  {uploading ? "Uploading…" : draft.imageUrl ? "Replace image" : "Upload an image"}
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                </label>
                {draft.imageUrl ? (
                  <button type="button" onClick={() => setDraft({ ...draft, imageUrl: null, imageAlt: "" })} className={dashButton.danger + ` ${focusRing}`}>
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
                <input id="collection-search" type="search" className={`${dashInput} pl-9`} placeholder="Search products" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200">
                {filtered.length === 0 ? (
                  <li className="px-4 py-3 text-sm text-slate-600">{products.length ? "No products match." : "You haven’t added any products yet. Add some on the Products page, then come back."}</li>
                ) : null}
                {filtered.map((p) => (
                  <li key={p.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                      <input type="checkbox" checked={draft.productIds.includes(p.id)} onChange={() => toggleProduct(p.id)} className="h-4 w-4 accent-blue-700" />
                      <span className="min-w-0 flex-1 break-words text-slate-900">{p.name}</span>
                      {p.status !== "active" ? <DashPill>{p.status === "draft" ? "Draft" : "Archived"}</DashPill> : null}
                    </label>
                  </li>
                ))}
              </ul>
              {draft.productIds.length ? (
                <p className="text-xs text-slate-600">Order: {draft.productIds.map((id) => productName.get(id) ?? "Unknown product").join(", ")}</p>
              ) : null}
            </fieldset>

            <label className="flex items-center gap-3 text-sm text-slate-800">
              <input type="checkbox" checked={draft.isVisible} onChange={(e) => setDraft({ ...draft, isVisible: e.target.checked })} className="h-4 w-4 accent-blue-700" />
              Show this collection on the shop
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" disabled={busy || uploading} className={`${dashButton.primary} ${focusRing}`}>
                {busy ? "Saving…" : "Save collection"}
              </button>
              <button type="button" onClick={() => setDraft(null)} className={`${dashButton.secondary} ${focusRing}`}>
                Cancel
              </button>
            </div>
          </form>
        </DashCard>
      ) : null}
    </div>
  );
}
