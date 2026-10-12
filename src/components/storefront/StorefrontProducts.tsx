"use client";

import { cloneElement, isValidElement, useCallback, useEffect, useId, useRef, useState } from "react";
import { Banknote, ChevronDown, Copy, ImageIcon, ImagePlus, Package, PackageOpen, Pencil, Plus, Trash2, TriangleAlert, Upload } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { TAX_CLASS_LABELS } from "@/lib/store/tax";
import { toastInfo, toastSuccess } from "@/lib/app-toast";
import { MAX_BULK_PRODUCTS, PRODUCTS_PAGE_SIZE } from "@/lib/store/product-catalogue";
import {
  BulkActionBar,
  EMPTY_FILTERS,
  ExportButton,
  ImportDialog,
  Pagination,
  ProductFilters,
  focusRing,
  hasActiveFilters,
  type CollectionOption,
  type ImportResult,
  type ProductFilterValues,
} from "./ProductCatalogueTools";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { DashboardProduct } from "@/lib/store/products";
import type { StoreRoleCapabilities } from "@/lib/store/access";
import { storefrontHost } from "@/lib/store/subdomain";
import { DashAlert, DashEmptyState, DashPageHeader, DashPill, DashSectionIntro, DashStatStrip, DashStatTile, dashButton, dashInput } from "./dashboard-ui";
import ProductCurrencyPrices, { loadFixedPrices, saveFixedPrices, type FixedPriceInputs, type StoreCurrencyInfo } from "./ProductCurrencyPrices";

type VariantFormRow = {
  /** Set for a saved variant, so saving updates it in place and past orders keep pointing at it. */
  id?: string;
  optionsText: string;
  sku: string;
  priceOverride: string;
  /** This option's own sale price, on the product's sale times. */
  salePrice: string;
  /** Whether it had a sale price when the form opened, so clearing it is sent. */
  hadSale?: boolean;
  stock: string;
  barcode: string;
  weightKg: string;
  imageUrl: string;
};

type GalleryImage = { url: string; alt: string };

type ProductFormState = {
  id: string | null;

  // Basic
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  sku: string;
  barcode: string;
  gtin: string;
  mpn: string;
  brand: string;
  category: string;
  subcategory: string;
  tags: string;
  productType: "physical" | "digital" | "service" | "subscription";
  status: "draft" | "active" | "archived";
  visibility: "visible" | "hidden" | "scheduled";
  condition: "new" | "used" | "refurbished";

  // Pricing & profit
  price: string;
  compareAtPrice: string;
  /** A timed sale: the price while it runs, and when (datetime-local values). */
  salePrice: string;
  saleStartsAt: string;
  saleEndsAt: string;
  costPrice: string;
  currency: string;
  taxable: boolean;
  taxClass: string;
  minimumOrderQty: string;

  // Inventory & shipping
  stock: string;
  reorderLevel: string;
  unit: string;
  allowBackorder: boolean;
  supplierName: string;
  warehouseLocation: string;
  deliveryExtra: string;
  weightKg: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  dimensionsUnit: string;
  countryOfOrigin: string;
  hsCode: string;

  // Media & SEO
  imageUrl: string;
  gallery: GalleryImage[];
  videoUrls: string;
  metaTitle: string;
  metaDescription: string;
  structuredDataType: string;

  // Returns & warranty
  returnable: boolean;
  returnWindowDays: string;
  warrantyText: string;

  // Merchandising & publishing
  featured: boolean;
  newArrival: boolean;
  bestSeller: boolean;
  publishedAt: string;
  discontinueAt: string;
  preorder: boolean;
  preorderAvailableDate: string;
  approvalStatus: "draft" | "pending_review" | "approved";

  // Traceability
  serialTracked: boolean;
  batchTracked: boolean;

  // Variants
  variants: VariantFormRow[];
};

const EMPTY_FORM: ProductFormState = {
  id: null,
  name: "",
  slug: "",
  shortDescription: "",
  description: "",
  sku: "",
  barcode: "",
  gtin: "",
  mpn: "",
  brand: "",
  category: "",
  subcategory: "",
  tags: "",
  productType: "physical",
  status: "active",
  visibility: "visible",
  condition: "new",

  price: "",
  compareAtPrice: "",
  salePrice: "",
  saleStartsAt: "",
  saleEndsAt: "",
  costPrice: "",
  currency: "",
  taxable: true,
  taxClass: "",
  minimumOrderQty: "1",

  stock: "0",
  reorderLevel: "10",
  unit: "piece",
  allowBackorder: false,
  supplierName: "",
  warehouseLocation: "",
  deliveryExtra: "",
  weightKg: "",
  lengthCm: "",
  widthCm: "",
  heightCm: "",
  dimensionsUnit: "cm",
  countryOfOrigin: "",
  hsCode: "",

  imageUrl: "",
  gallery: [],
  videoUrls: "",
  metaTitle: "",
  metaDescription: "",
  structuredDataType: "Product",

  returnable: true,
  returnWindowDays: "",
  warrantyText: "",

  featured: false,
  newArrival: false,
  bestSeller: false,
  publishedAt: "",
  discontinueAt: "",
  preorder: false,
  preorderAvailableDate: "",
  approvalStatus: "approved",

  serialTracked: false,
  batchTracked: false,

  variants: [],
};

type SectionKey = "variants" | "pricing" | "stock" | "seo" | "codes" | "display" | "returns" | "more";

/** Money in the shop's own currency, written the way its customers write it. */
const formatCurrency = (value: number, currency: string | null) => formatShopCurrency(value, currency);

const STOCK_PILL: Record<DashboardProduct["stockStatus"], { tone: "green" | "amber" | "red"; label: string }> = {
  "in-stock": { tone: "green", label: "In stock" },
  "low-stock": { tone: "amber", label: "Running low" },
  "out-of-stock": { tone: "red", label: "Sold out" },
};

const STATUS_PILL: Record<DashboardProduct["status"], { tone: "blue" | "slate"; label: string }> = {
  active: { tone: "blue", label: "Active" },
  draft: { tone: "slate", label: "Draft" },
  archived: { tone: "slate", label: "Archived" },
};

function StockPill({ product }: { product: DashboardProduct }) {
  const pill = STOCK_PILL[product.stockStatus];
  return (
    <DashPill tone={pill.tone}>
      {product.stockStatus === "out-of-stock" ? pill.label : `${pill.label} (${product.stock})`}
    </DashPill>
  );
}

function parseOptionsText(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of text.split(",")) {
    const [key, value] = pair.split("=").map((part) => part.trim());
    if (key && value) result[key] = value;
  }
  return result;
}

function formatOptionsText(options: Record<string, string>): string {
  return Object.entries(options)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

/** A readable web link from a product name: "Ankara Dress (Red)" becomes "ankara-dress-red". */
function slugifyName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");
}

const numberInput = `${dashInput} tabular-nums`;

/** An ISO time as a datetime-local value in the merchant's own time zone. */
function toLocalDateTime(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function StorefrontProducts({
  slug,
  capabilities,
}: {
  slug: string;
  capabilities: StoreRoleCapabilities;
}) {
  const [products, setProducts] = useState<DashboardProduct[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importSkipped, setImportSkipped] = useState<{ row: number; reason: string }[] | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: boolean; price?: boolean }>({});
  const [slugTouched, setSlugTouched] = useState(false);
  const [openSections, setOpenSections] = useState<Partial<Record<SectionKey, boolean>>>({});
  const imageInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const [currencyInfo, setCurrencyInfo] = useState<StoreCurrencyInfo | null>(null);
  const [fixedPrices, setFixedPrices] = useState<FixedPriceInputs>({});
  const savedFixedPrices = useRef<Awaited<ReturnType<typeof loadFixedPrices>>["rows"]>([]);
  const homeCurrency = currencyInfo?.homeCurrency ?? null;

  // The list: one page at a time, searched, filtered and sorted on the server.
  const [filters, setFilters] = useState<ProductFilterValues>(EMPTY_FILTERS);
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [listInfo, setListInfo] = useState({ total: 0, pageCount: 1, categories: [] as string[], canExport: false });
  const [collections, setCollections] = useState<CollectionOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [listMessage, setListMessage] = useState("");
  const [upgradeNote, setUpgradeNote] = useState(false);
  const [duplicating, setDuplicating] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const takenSlugs = useRef<Set<string> | null>(null);
  const latestRequest = useRef(0);

  const fetchPage = useCallback(async () => {
    const params = new URLSearchParams({ slug, page: String(page), sort: filters.sort });
    if (searchTerm) params.set("q", searchTerm);
    if (filters.status) params.set("status", filters.status);
    if (filters.stock) params.set("stock", filters.stock);
    if (filters.category) params.set("category", filters.category);
    if (filters.collection) params.set("collection", filters.collection);
    const res = await fetch(`/api/store/products/list?${params}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "We couldn't load your products. Please refresh the page.");
    return json as { products: DashboardProduct[]; total: number; pageCount: number; categories: string[]; canExport: boolean };
  }, [slug, page, searchTerm, filters.sort, filters.status, filters.stock, filters.category, filters.collection]);

  useEffect(() => {
    const request = ++latestRequest.current;
    (async () => {
      try {
        const json = await fetchPage();
        if (request !== latestRequest.current) return;
        // Deleting the last products on a page: step back to the page before.
        if (!json.products.length && page > 1 && json.total > 0) {
          setPage(Math.max(1, json.pageCount));
          return;
        }
        setProducts(json.products || []);
        setListInfo({ total: json.total ?? 0, pageCount: json.pageCount ?? 1, categories: json.categories || [], canExport: Boolean(json.canExport) });
        const from = json.total ? (page - 1) * PRODUCTS_PAGE_SIZE + 1 : 0;
        const to = (page - 1) * PRODUCTS_PAGE_SIZE + (json.products || []).length;
        setListMessage(json.total ? `Showing ${from} to ${to} of ${json.total} ${json.total === 1 ? "product" : "products"}.` : "No products match.");
      } catch (err) {
        if (request === latestRequest.current) setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    })();
  }, [fetchPage, page, reloadKey]);

  /** Loads the current page again, after a save, delete or import. */
  async function loadProducts() {
    takenSlugs.current = null;
    setReloadKey((k) => k + 1);
  }

  // Wait until typing pauses before searching.
  useEffect(() => {
    const next = filters.q.trim();
    if (next === searchTerm) return;
    const timer = setTimeout(() => {
      setSearchTerm(next);
      setPage(1);
      setSelected(new Set());
    }, 350);
    return () => clearTimeout(timer);
  }, [filters.q, searchTerm]);

  useEffect(() => {
    let cancelled = false;

    // The shop's home currency and any others it shows prices in.
    fetch(`/api/store/currencies?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.settings) setCurrencyInfo({ homeCurrency: d.homeCurrency, settings: d.settings, liveRates: d.liveRates });
      })
      .catch(() => undefined);

    // Collections, for the filter and "add to collection".
    fetch(`/api/store/collections?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && Array.isArray(d?.collections)) setCollections(d.collections.map((c: CollectionOption) => ({ id: c.id, name: c.name })));
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [slug]);

  // The figures at the top: counted across every product, not just this page.
  const [stats, setStats] = useState<{ products: number; retailValue: number; costValue: number; soldOut: number; low: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/store/products/stats?slug=${encodeURIComponent(slug)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!cancelled && json) setStats(json);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [slug, reloadKey]);

  function changeFilters(patch: Partial<ProductFilterValues>) {
    setFilters((prev) => ({ ...prev, ...patch }));
    // A new search waits for the pause in typing; everything else applies straight away.
    if (Object.keys(patch).some((k) => k !== "q")) {
      setPage(1);
      setSelected(new Set());
    }
    // Clearing the search shows everything again straight away.
    if (patch.q === "") {
      setSearchTerm("");
      setPage(1);
      setSelected(new Set());
    }
  }

  /** Ticked products stay ticked across pages, so a change can cover more than one page. */
  function changePage(next: number) {
    setPage(next);
    document.getElementById("products-results")?.focus();
  }

  /** Ticks every product that matches the current search and filters (up to the bulk limit). */
  async function selectAllMatching() {
    const params = new URLSearchParams({ slug, fields: "ids", sort: filters.sort });
    if (searchTerm) params.set("q", searchTerm);
    if (filters.status) params.set("status", filters.status);
    if (filters.stock) params.set("stock", filters.stock);
    if (filters.category) params.set("category", filters.category);
    if (filters.collection) params.set("collection", filters.collection);
    try {
      const res = await fetch(`/api/store/products/list?${params}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !Array.isArray(json.ids)) throw new Error();
      const ids = (json.ids as string[]).slice(0, MAX_BULK_PRODUCTS);
      setSelected(new Set(ids));
      setListMessage(`Selected ${ids.length} ${ids.length === 1 ? "product" : "products"}.`);
    } catch {
      setError("We couldn't select those products. Please try again.");
    }
  }

  function toggleSelected(id: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleAllOnPage(on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const p of products || []) {
        if (on) next.add(p.id);
        else next.delete(p.id);
      }
      return next;
    });
  }

  async function handleDuplicate(product: DashboardProduct) {
    setDuplicating(product.id);
    setError(null);
    try {
      const res = await fetch(`/api/store/products/${product.id}/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "We couldn't copy that product.");
      toastSuccess("Product copied", `"${json.product.name}" is saved as a draft. Make your changes, then set it to Active.`);
      setListMessage(`Copied ${product.name}. The copy is saved as a draft.`);
      await loadProducts();
      openEdit(json.product as DashboardProduct);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't copy that product.");
    } finally {
      setDuplicating(null);
    }
  }

  function handleImported(result: ImportResult) {
    const parts = [`Added ${result.created} new`, `updated ${result.updated}`];
    if (result.skipped.length) {
      setImportSkipped(result.skipped);
      toastInfo("Import finished with some rows skipped", `${parts.join(", ")}. Skipped ${result.skipped.length} row${result.skipped.length === 1 ? "" : "s"} — see the details on the page.`);
    } else {
      setImportSkipped(null);
      toastSuccess("Import complete", `${parts.join(", ")}.`);
    }
    setListMessage(`Import complete. ${parts.join(", ")}.`);
    loadProducts();
  }

  /** A web link for a new product that doesn't clash with one the shop already uses. */
  function suggestSlug(name: string) {
    const base = slugifyName(name);
    if (!base) return "";
    const taken = new Set([...(takenSlugs.current ?? []), ...(products || []).map((p) => p.slug).filter(Boolean)]);
    let candidate = base;
    let n = 2;
    while (taken.has(candidate)) candidate = `${base}-${n++}`;
    return candidate;
  }

  function resetDialogUi(isExisting: boolean) {
    setFieldErrors({});
    setOpenSections({});
    setSlugTouched(isExisting);
    setDragging(false);
  }

  function openCreate() {
    // Only one page of products is loaded, so fetch every web link in use for suggesting a new one.
    if (!takenSlugs.current) {
      fetch(`/api/store/products/list?slug=${encodeURIComponent(slug)}&fields=slugs`)
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (Array.isArray(d?.slugs)) takenSlugs.current = new Set(d.slugs as string[]);
        })
        .catch(() => undefined);
    }
    setForm(EMPTY_FORM);
    setFixedPrices({});
    savedFixedPrices.current = [];
    resetDialogUi(false);
    setDialogOpen(true);
  }

  function openEdit(product: DashboardProduct) {
    setForm({
      id: product.id,
      name: product.name,
      slug: product.slug || "",
      shortDescription: product.shortDescription || "",
      description: product.description || "",
      sku: product.sku || "",
      barcode: product.barcode || "",
      gtin: product.gtin || "",
      mpn: product.mpn || "",
      brand: product.brand || "",
      category: product.category || "",
      subcategory: product.subcategory || "",
      tags: (product.tags || []).join(", "),
      productType: product.productType,
      status: product.status,
      visibility: product.visibility,
      condition: product.condition,

      price: String(product.sellingPrice),
      compareAtPrice: product.compareAtPrice != null ? String(product.compareAtPrice) : "",
      salePrice: product.salePrice != null ? String(product.salePrice) : "",
      saleStartsAt: toLocalDateTime(product.saleStartsAt),
      saleEndsAt: toLocalDateTime(product.saleEndsAt),
      costPrice: product.costPrice ? String(product.costPrice) : "",
      currency: product.currency || "",
      taxable: product.taxable,
      taxClass: product.taxClass || "",
      minimumOrderQty: String(product.minimumOrderQty ?? 1),

      stock: String(product.stock),
      reorderLevel: String(product.reorderLevel),
      unit: product.unit || "piece",
      allowBackorder: product.allowBackorder,
      supplierName: product.supplierName || "",
      warehouseLocation: product.warehouseLocation || "",
      deliveryExtra: product.deliveryExtra ? String(product.deliveryExtra) : "",
      weightKg: product.weightKg != null ? String(product.weightKg) : "",
      lengthCm: product.lengthCm != null ? String(product.lengthCm) : "",
      widthCm: product.widthCm != null ? String(product.widthCm) : "",
      heightCm: product.heightCm != null ? String(product.heightCm) : "",
      dimensionsUnit: product.dimensionsUnit || "cm",
      countryOfOrigin: product.countryOfOrigin || "",
      hsCode: product.hsCode || "",

      imageUrl: product.imageUrl || "",
      gallery: (product.imageUrls || []).map((url, i) => ({ url, alt: product.imageAltTexts?.[i] || "" })),
      videoUrls: (product.videoUrls || []).join("\n"),
      metaTitle: product.metaTitle || "",
      metaDescription: product.metaDescription || "",
      structuredDataType: product.structuredDataType || "Product",

      returnable: product.returnable,
      returnWindowDays: product.returnWindowDays != null ? String(product.returnWindowDays) : "",
      warrantyText: product.warrantyText || "",

      featured: product.featured,
      newArrival: product.newArrival,
      bestSeller: product.bestSeller,
      publishedAt: product.publishedAt ? product.publishedAt.slice(0, 10) : "",
      discontinueAt: product.discontinueAt ? product.discontinueAt.slice(0, 10) : "",
      preorder: product.preorder,
      preorderAvailableDate: product.preorderAvailableDate || "",
      approvalStatus: product.approvalStatus,

      serialTracked: product.serialTracked,
      batchTracked: product.batchTracked,

      variants: (product.variants || []).map((v) => ({
        id: v.id,
        optionsText: formatOptionsText(v.options || {}),
        sku: v.sku || "",
        priceOverride: v.price_override != null ? String(v.price_override) : "",
        salePrice: (v as { sale_price?: number | null }).sale_price != null ? String((v as { sale_price?: number | null }).sale_price) : "",
        hadSale: (v as { sale_price?: number | null }).sale_price != null,
        stock: String(v.stock ?? 0),
        barcode: v.barcode || "",
        weightKg: v.weight_kg != null ? String(v.weight_kg) : "",
        imageUrl: v.image_url || "",
      })),
    });
    setFixedPrices({});
    savedFixedPrices.current = [];
    if (currencyInfo?.settings.extra.length) {
      loadFixedPrices(slug, product.id).then(({ inputs, rows }) => {
        setFixedPrices(inputs);
        savedFixedPrices.current = rows;
      });
    }
    // Existing products keep their web link unless the owner changes it.
    resetDialogUi(true);
    setDialogOpen(true);
  }

  async function handleImageUpload(file: File, target: "main" | "gallery") {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("slug", slug);
      body.append("file", file);
      const res = await fetch("/api/store/products/upload-image", { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to upload image.");
      if (target === "main") {
        setForm((prev) => ({ ...prev, imageUrl: json.url }));
      } else {
        setForm((prev) => ({ ...prev, gallery: [...prev.gallery, { url: json.url, alt: "" }] }));
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image.");
      return false;
    } finally {
      setUploading(false);
    }
  }

  /** Uploads photos one at a time. The first becomes the main photo if there isn't one yet. */
  async function uploadPhotos(files: File[]) {
    let hasMain = Boolean(form.imageUrl);
    for (const file of files.filter((f) => f.type.startsWith("image/"))) {
      const ok = await handleImageUpload(file, hasMain ? "gallery" : "main");
      if (ok) hasMain = true;
    }
  }

  function updateVariant(index: number, patch: Partial<VariantFormRow>) {
    setForm((prev) => ({
      ...prev,
      variants: prev.variants.map((v, i) => (i === index ? { ...v, ...patch } : v)),
    }));
  }

  function addVariant() {
    setForm((prev) => ({
      ...prev,
      variants: [...prev.variants, { optionsText: "", sku: "", priceOverride: "", salePrice: "", stock: "0", barcode: "", weightKg: "", imageUrl: "" }],
    }));
  }

  function removeVariant(index: number) {
    setForm((prev) => ({ ...prev, variants: prev.variants.filter((_, i) => i !== index) }));
  }

  function removeGalleryImage(index: number) {
    setForm((prev) => ({ ...prev, gallery: prev.gallery.filter((_, i) => i !== index) }));
  }

  function setSection(key: SectionKey, open: boolean) {
    setOpenSections((prev) => (prev[key] === open ? prev : { ...prev, [key]: open }));
  }

  function editWebLink() {
    setSection("seo", true);
    setTimeout(() => document.getElementById("product-slug")?.focus(), 0);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.price) {
      setError("Name and price are required.");
      setFieldErrors({ name: !form.name.trim(), price: !form.price });
      document.getElementById(!form.name.trim() ? "product-name" : "product-price")?.focus();
      return;
    }

    setSaving(true);
    setError(null);
    setFieldErrors({});

    const payload = {
      tenantSlug: slug,
      // Basic
      name: form.name.trim(),
      slug: form.slug.trim() || null,
      description: form.description.trim() || null,
      short_description: form.shortDescription.trim() || null,
      sku: form.sku.trim() || null,
      barcode: form.barcode.trim() || null,
      gtin: form.gtin.trim() || null,
      mpn: form.mpn.trim() || null,
      brand: form.brand.trim() || null,
      category: form.category.trim() || null,
      subcategory: form.subcategory.trim() || null,
      tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean),
      product_type: form.productType,
      status: form.status,
      visibility: form.visibility,
      condition: form.condition,

      // Pricing
      price: Number(form.price),
      compare_at_price: form.compareAtPrice ? Number(form.compareAtPrice) : null,
      sale_price: form.salePrice ? Number(form.salePrice) : null,
      sale_starts_at: form.salePrice && form.saleStartsAt ? new Date(form.saleStartsAt).toISOString() : null,
      sale_ends_at: form.salePrice && form.saleEndsAt ? new Date(form.saleEndsAt).toISOString() : null,
      cost_price: form.costPrice ? Number(form.costPrice) : null,
      // Prices are always in the shop's home currency.
      currency: homeCurrency ?? (form.currency.trim() || null),
      taxable: form.taxable,
      tax_class: form.taxClass === "standard" || form.taxClass === "zero" || form.taxClass === "exempt" ? form.taxClass : null,
      minimum_order_qty: Number(form.minimumOrderQty) || 1,

      // Inventory & shipping
      stock: Number(form.stock) || 0,
      reorder_level: Number(form.reorderLevel) || 10,
      unit: form.unit.trim() || "piece",
      allow_backorder: form.allowBackorder,
      supplier_name: form.supplierName.trim() || null,
      warehouse_location: form.warehouseLocation.trim() || null,
      delivery_extra: form.deliveryExtra ? Number(form.deliveryExtra) : null,
      weight_kg: form.weightKg ? Number(form.weightKg) : null,
      length_cm: form.lengthCm ? Number(form.lengthCm) : null,
      width_cm: form.widthCm ? Number(form.widthCm) : null,
      height_cm: form.heightCm ? Number(form.heightCm) : null,
      dimensions_unit: form.dimensionsUnit.trim() || "cm",
      country_of_origin: form.countryOfOrigin.trim() || null,
      hs_code: form.hsCode.trim() || null,

      // Media & SEO
      image_url: form.imageUrl || null,
      image_urls: form.gallery.map((g) => g.url),
      image_alt_texts: form.gallery.map((g) => g.alt),
      video_urls: form.videoUrls.split("\n").map((v) => v.trim()).filter(Boolean),
      meta_title: form.metaTitle.trim() || null,
      meta_description: form.metaDescription.trim() || null,
      structured_data_type: form.structuredDataType.trim() || "Product",

      // Returns
      returnable: form.returnable,
      return_window_days: form.returnWindowDays ? Number(form.returnWindowDays) : null,
      warranty_text: form.warrantyText.trim() || null,

      // Merchandising & publishing
      featured: form.featured,
      new_arrival: form.newArrival,
      best_seller: form.bestSeller,
      published_at: form.publishedAt || null,
      discontinue_at: form.discontinueAt || null,
      preorder: form.preorder,
      preorder_available_date: form.preorderAvailableDate || null,
      approval_status: form.approvalStatus,

      // Traceability
      serial_tracked: form.serialTracked,
      batch_tracked: form.batchTracked,

      // Variants
      variants: form.variants.map((v) => ({
        id: v.id,
        options: parseOptionsText(v.optionsText),
        sku: v.sku.trim() || undefined,
        price_override: v.priceOverride ? Number(v.priceOverride) : undefined,
        // Only sent when set or being cleared, so saves still work before the sale columns exist.
        ...(v.salePrice || v.hadSale
          ? {
              sale_price: v.salePrice ? Number(v.salePrice) : null,
              sale_starts_at: v.salePrice && form.saleStartsAt ? new Date(form.saleStartsAt).toISOString() : null,
              sale_ends_at: v.salePrice && form.saleEndsAt ? new Date(form.saleEndsAt).toISOString() : null,
            }
          : {}),
        stock: v.stock ? Number(v.stock) : 0,
        barcode: v.barcode.trim() || undefined,
        weight_kg: v.weightKg ? Number(v.weightKg) : undefined,
        image_url: v.imageUrl.trim() || undefined,
      })),
    };

    try {
      const res = await fetch(form.id ? `/api/store/products/${form.id}` : "/api/store/products", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save product.");
      if (currencyInfo?.settings.extra.length && json.product?.id) {
        await saveFixedPrices(slug, json.product.id, fixedPrices, savedFixedPrices.current, currencyInfo.settings.extra.map((c) => c.code));
      }
      setDialogOpen(false);
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save product.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(product: DashboardProduct) {
    if (!confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(
        `/api/store/products/${product.id}?slug=${encodeURIComponent(slug)}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete product.");
      toggleSelected(product.id, false);
      setListMessage(`Deleted ${product.name}.`);
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete product.");
    }
  }

  const price = Number(form.price) || 0;
  const cost = Number(form.costPrice) || 0;
  const profit = price - cost;
  const margin = price > 0 ? (profit / price) * 100 : 0;
  const money = homeCurrency ? ` (${homeCurrency})` : "";
  const webLinkPath = `${storefrontHost(slug)}/products/`;
  const webLinkSlug = form.slug.trim() || (form.id ? form.id : "");

  const set = <K extends keyof ProductFormState>(key: K) => (value: ProductFormState[K]) => setForm((p) => ({ ...p, [key]: value }));
  const text = (key: { [K in keyof ProductFormState]: ProductFormState[K] extends string ? K : never }[keyof ProductFormState]) => ({
    value: form[key] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((p) => ({ ...p, [key]: e.target.value })),
  });

  return (
    <div className="space-y-6">
      <DashPageHeader
        title="Products"
        description="What you sell, its price and how many you have. Only a name and price are needed to start."
        actions={
          <>
            {capabilities.canImportProducts ? (
              <button type="button" className={`${dashButton.secondary} ${focusRing}`} onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" aria-hidden />
                Import
                <span className="sr-only"> products from a spreadsheet</span>
              </button>
            ) : null}
            <ExportButton slug={slug} canExport={listInfo.canExport} onUpgradeNeeded={() => setUpgradeNote(true)} />
            <button type="button" className={`${dashButton.primary} ${focusRing}`} onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden />
              Add product
            </button>
          </>
        }
      />

      {stats && stats.products > 0 ? (
        <>
          <DashSectionIntro
            id="products"
            meaning="stock"
            art="box"
            title="Your products"
            points={[
              "Add photos, sizes and colours whenever you're ready. Only a name and price are needed.",
              "We count your stock as orders come in, and tell you when something runs low.",
              "Group products into collections so customers can browse them together.",
            ]}
          />
          <DashStatStrip label="Your stock in figures">
            <DashStatTile label="Products" meaning="stock" icon={Package} hint="In your shop, not archived" value={String(stats.products)} />
            <DashStatTile
              label="Stock worth"
              meaning="money"
              icon={Banknote}
              hint={stats.costValue ? `Cost you ${formatCurrency(stats.costValue, homeCurrency)}` : "At your selling prices"}
              value={formatCurrency(stats.retailValue, homeCurrency)}
            />
            <DashStatTile
              label="Sold out"
              meaning="marketing"
              icon={PackageOpen}
              hint={stats.soldOut ? "Tap to see them" : "Nothing sold out"}
              value={String(stats.soldOut)}
              onClick={() => changeFilters({ stock: filters.stock === "out-of-stock" ? "" : "out-of-stock" })}
              pressed={filters.stock === "out-of-stock"}
            />
            <DashStatTile
              label="Running low"
              meaning="customers"
              icon={TriangleAlert}
              hint={stats.low ? "Tap to see them" : "Nothing running low"}
              value={String(stats.low)}
              onClick={() => changeFilters({ stock: filters.stock === "low-stock" ? "" : "low-stock" })}
              pressed={filters.stock === "low-stock"}
            />
          </DashStatStrip>
        </>
      ) : null}

      {capabilities.canImportProducts ? <ImportDialog open={importOpen} onOpenChange={setImportOpen} slug={slug} onImported={handleImported} /> : null}

      {upgradeNote ? (
        <div role="status" className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-800">
          <p className="min-w-0 flex-1">
            Downloading your products as a spreadsheet is part of the Standard plan.{" "}
            <a href={`/storefront/${encodeURIComponent(slug)}/payments`} className={`rounded font-medium text-blue-700 underline ${focusRing}`}>
              See plans in Payments and plan
            </a>
            .
          </p>
          <button type="button" className={`${dashButton.quiet} ${focusRing}`} onClick={() => setUpgradeNote(false)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {error && !dialogOpen ? <DashAlert message={error} /> : null}

      {importSkipped && importSkipped.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium text-amber-900">
              {importSkipped.length} row{importSkipped.length === 1 ? "" : "s"} skipped during import
            </p>
            <button
              type="button"
              onClick={() => setImportSkipped(null)}
              className="shrink-0 rounded text-xs font-medium text-amber-800 hover:text-amber-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue"
            >
              Dismiss
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-amber-900">
            {importSkipped.slice(0, 20).map((s, i) => (
              <li key={`${s.row}-${i}`}>
                Row {s.row}: {s.reason}
              </li>
            ))}
          </ul>
          {importSkipped.length > 20 ? (
            <p className="mt-2 text-xs text-amber-800">…and {importSkipped.length - 20} more.</p>
          ) : null}
        </div>
      ) : null}

      {!products ? (
        <p role="status" className="text-sm text-slate-600">Loading products…</p>
      ) : products.length === 0 && listInfo.total === 0 && !hasActiveFilters(filters) && !searchTerm ? (
        <DashEmptyState
          art="box"
          meaning="stock"
          title="Add your first product"
          description={<>A name and a price is all you need to start. You can add photos, sizes and colours whenever you&rsquo;re ready.</>}
          action={
            <div className="flex flex-col items-center">
              <button type="button" className={`${dashButton.primary} ${focusRing}`} onClick={openCreate}>
                <Plus className="h-4 w-4" aria-hidden />
                Add a product
              </button>
              {capabilities.canImportProducts ? (
                <p className="mt-3 text-xs text-slate-600">Have a spreadsheet of products? Use &ldquo;Import&rdquo; above.</p>
              ) : null}
            </div>
          }
        />
      ) : (
        <>
          <ProductFilters values={filters} onChange={changeFilters} categories={listInfo.categories} collections={collections} />

          {selected.size > 0 && capabilities.canManageProducts ? (
            <BulkActionBar
              slug={slug}
              selectedIds={[...selected]}
              categories={listInfo.categories}
              collections={collections}
              canDelete={capabilities.canDeleteProducts}
              currencyLabel={money}
              onClear={() => setSelected(new Set())}
              onDone={(message, deleted) => {
                setSelected(new Set());
                setListMessage(message);
                toastSuccess(deleted ? "Products deleted" : "Products updated", message);
                if (deleted) takenSlugs.current = null;
                loadProducts();
              }}
            />
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p id="products-results" tabIndex={-1} role="status" aria-live="polite" className="text-sm text-slate-700 focus:outline-none">
              {listMessage}
            </p>
            {capabilities.canManageProducts && selected.size > 0 && listInfo.total > products.length && selected.size < Math.min(listInfo.total, MAX_BULK_PRODUCTS) ? (
              <button type="button" className={`${dashButton.quiet} ${focusRing}`} onClick={selectAllMatching}>
                {listInfo.total <= MAX_BULK_PRODUCTS ? `Select all ${listInfo.total} matching products` : `Select the first ${MAX_BULK_PRODUCTS} matching products`}
              </button>
            ) : null}
          </div>

          {products.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center">
              <p className="text-base font-semibold text-slate-900">No products match</p>
              <p className="mt-1 text-sm text-slate-600">Try a different word, or clear the filters to see everything.</p>
              <button type="button" className={`${dashButton.secondary} ${focusRing} mt-4`} onClick={() => changeFilters({ ...EMPTY_FILTERS, sort: filters.sort })}>
                Clear search and filters
              </button>
            </div>
          ) : (
            <>
              {/* Phones: one card per product. */}
              <div className="md:hidden">
                {capabilities.canManageProducts ? (
                  <SelectAllOnPage products={products} selected={selected} onToggle={toggleAllOnPage} className="mb-3 flex items-center gap-3 px-1" />
                ) : null}
                <ul className="space-y-3">
                  {products.map((product) => (
                    <li key={product.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${selected.has(product.id) ? "border-blue-400" : "border-slate-200"}`}>
                      <div className="flex items-start gap-3">
                        {capabilities.canManageProducts ? (
                          <RowCheckbox product={product} checked={selected.has(product.id)} onChange={toggleSelected} className="mt-1" />
                        ) : null}
                        <ProductThumb product={product} size="h-16 w-16" />
                        <div className="min-w-0 flex-1">
                          <p className="break-words font-semibold text-slate-900">{product.name}</p>
                          <p className="mt-0.5 text-sm text-slate-800">{formatCurrency(product.sellingPrice, homeCurrency ?? product.currency)}</p>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <StockPill product={product} />
                            <DashPill tone={STATUS_PILL[product.status].tone}>{STATUS_PILL[product.status].label}</DashPill>
                            {product.featured ? <DashPill tone="amber">Featured</DashPill> : null}
                          </div>
                          {product.category ? <p className="mt-2 text-xs text-slate-600">{product.category}</p> : null}
                          {product.sku ? <p className="mt-1 break-all text-xs text-slate-600">SKU: {product.sku}</p> : null}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                        <button type="button" className={`${dashButton.secondary} ${focusRing}`} onClick={() => openEdit(product)}>
                          <Pencil className="h-4 w-4" aria-hidden />
                          Edit<span className="sr-only"> {product.name}</span>
                        </button>
                        {capabilities.canManageProducts ? (
                          <button
                            type="button"
                            className={`${dashButton.secondary} ${focusRing}`}
                            onClick={() => handleDuplicate(product)}
                            disabled={duplicating === product.id}
                          >
                            <Copy className="h-4 w-4" aria-hidden />
                            {duplicating === product.id ? "Copying…" : "Copy"}
                            <span className="sr-only"> {product.name}</span>
                          </button>
                        ) : null}
                        {capabilities.canDeleteProducts ? (
                          <button type="button" className={`${dashButton.danger} ${focusRing}`} onClick={() => handleDelete(product)}>
                            <Trash2 className="h-4 w-4" aria-hidden />
                            Delete<span className="sr-only"> {product.name}</span>
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Your products, page {page} of {listInfo.pageCount}</caption>
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      {capabilities.canManageProducts ? (
                        <th scope="col" className="w-10 px-4 py-3">
                          <SelectAllOnPage products={products} selected={selected} onToggle={toggleAllOnPage} compact />
                        </th>
                      ) : null}
                      <th scope="col" className="px-4 py-3">Product</th>
                      <th scope="col" className="px-4 py-3">Stock code</th>
                      <th scope="col" className="px-4 py-3">Category</th>
                      <th scope="col" className="px-4 py-3">Price</th>
                      <th scope="col" className="px-4 py-3">Profit</th>
                      <th scope="col" className="px-4 py-3">Stock</th>
                      <th scope="col" className="px-4 py-3">Status</th>
                      <th scope="col" className="px-4 py-3">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {products.map((product) => (
                      <tr key={product.id} className={`border-b border-slate-100 last:border-0 ${selected.has(product.id) ? "bg-blue-50/60" : ""}`}>
                        {capabilities.canManageProducts ? (
                          <td className="px-4 py-3">
                            <RowCheckbox product={product} checked={selected.has(product.id)} onChange={toggleSelected} />
                          </td>
                        ) : null}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <ProductThumb product={product} size="h-11 w-11" />
                            <div className="min-w-0">
                              <p className="font-medium text-slate-900">{product.name}</p>
                              {product.featured ? <DashPill tone="amber">Featured</DashPill> : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{product.sku || "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{product.category || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-900">
                          {formatCurrency(product.sellingPrice, homeCurrency ?? product.currency)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                          {formatCurrency(product.profit, homeCurrency ?? product.currency)} ({product.profitMargin.toFixed(0)}%)
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          <StockPill product={product} />
                        </td>
                        <td className="px-4 py-3">
                          <DashPill tone={STATUS_PILL[product.status].tone}>{STATUS_PILL[product.status].label}</DashPill>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button type="button" className={`${dashButton.quiet} ${focusRing}`} onClick={() => openEdit(product)}>
                              Edit<span className="sr-only"> {product.name}</span>
                            </button>
                            {capabilities.canManageProducts ? (
                              <button
                                type="button"
                                className={`${dashButton.quiet} ${focusRing}`}
                                onClick={() => handleDuplicate(product)}
                                disabled={duplicating === product.id}
                                aria-label={`Copy ${product.name}`}
                                title="Make a copy"
                              >
                                <Copy className="h-4 w-4" aria-hidden />
                              </button>
                            ) : null}
                            {capabilities.canDeleteProducts ? (
                              <button
                                type="button"
                                className={`${dashButton.danger} ${focusRing}`}
                                onClick={() => handleDelete(product)}
                                aria-label={`Delete ${product.name}`}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <Pagination page={page} pageCount={listInfo.pageCount} onPage={changePage} />
            </>
          )}
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        {/* Full screen on phones; a centred panel from small screens up. Only the middle scrolls, so Save is always in reach. */}
        <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 p-0 motion-reduce:animate-none sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-[24px] sm:border">
          <DialogHeader className="shrink-0 border-b border-slate-200 px-5 pb-4 pt-5 text-left sm:px-6">
            <DialogTitle>{form.id ? "Edit product" : "Add a product"}</DialogTitle>
            <DialogDescription className="text-slate-600">
              Start with the essentials. Everything else is optional and can wait.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-8 overflow-y-auto overflow-x-hidden overscroll-contain px-5 py-5 sm:px-6">
            {/* The quick form: enough to start selling. */}
            <div className="space-y-5">
              <section aria-labelledby="product-photos-label">
                <h3 id="product-photos-label" className="text-sm font-medium text-slate-800">
                  Photos
                </h3>
                <p id="product-photos-hint" className="mt-0.5 text-xs text-slate-600">
                  The first photo is the main one shoppers see. Clear, bright photos help it sell.
                </p>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) handleImageUpload(file, "main");
                  }}
                />
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    e.target.value = "";
                    if (files.length) uploadPhotos(files);
                  }}
                />

                {form.imageUrl ? (
                  <div className="mt-3 space-y-3">
                    <div className="flex flex-wrap items-end gap-4">
                      <figure>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={form.imageUrl} alt="Main product photo" className="h-36 w-36 rounded-2xl border border-slate-200 object-cover" />
                        <figcaption className="mt-1 text-xs text-slate-600">Main photo</figcaption>
                      </figure>
                      <button type="button" className={dashButton.secondary} disabled={uploading} onClick={() => imageInputRef.current?.click()}>
                        <ImagePlus className="h-4 w-4" aria-hidden />
                        Change main photo
                      </button>
                    </div>

                    {form.gallery.length > 0 ? (
                      <ul className="space-y-2" aria-label="More photos">
                        {form.gallery.map((img, i) => (
                          <li key={i} className="flex items-center gap-3">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={img.url} alt="" className="h-14 w-14 shrink-0 rounded-xl border border-slate-200 object-cover" />
                            <div className="min-w-0 flex-1">
                              <label htmlFor={`gallery-alt-${i}`} className="sr-only">
                                Describe photo {i + 2}
                              </label>
                              <input
                                id={`gallery-alt-${i}`}
                                className={dashInput}
                                placeholder="Describe this photo (helps people using screen readers)"
                                value={img.alt}
                                onChange={(e) =>
                                  setForm((p) => ({
                                    ...p,
                                    gallery: p.gallery.map((g, gi) => (gi === i ? { ...g, alt: e.target.value } : g)),
                                  }))
                                }
                              />
                            </div>
                            <button
                              type="button"
                              className={dashButton.danger}
                              onClick={() => removeGalleryImage(i)}
                              aria-label={`Remove photo ${i + 2}`}
                            >
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <PhotoDropArea
                      compact
                      uploading={uploading}
                      dragging={dragging}
                      setDragging={setDragging}
                      onFiles={uploadPhotos}
                      onClick={() => galleryInputRef.current?.click()}
                    />
                  </div>
                ) : (
                  <div className="mt-3">
                    <PhotoDropArea
                      uploading={uploading}
                      dragging={dragging}
                      setDragging={setDragging}
                      onFiles={uploadPhotos}
                      onClick={() => galleryInputRef.current?.click()}
                    />
                  </div>
                )}
                {uploading ? (
                  <p role="status" className="mt-2 text-sm text-slate-600">
                    Uploading your photo…
                  </p>
                ) : null}
              </section>

              <div>
                <Field id="product-name" label="Name" required error={fieldErrors.name ? "Give your product a name." : undefined}>
                  <input
                    className={dashInput}
                    autoComplete="off"
                    value={form.name}
                    onChange={(e) => {
                      const name = e.target.value;
                      setForm((p) => ({ ...p, name, slug: !p.id && !slugTouched ? suggestSlug(name) : p.slug }));
                      if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: false }));
                    }}
                  />
                </Field>
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
                  <span className="min-w-0 break-all">
                    Web link: {webLinkPath}
                    {webLinkSlug ? <span className="font-medium text-slate-800">{webLinkSlug}</span> : <span className="italic">your-product-name</span>}
                  </span>
                  <button type="button" className={`${dashButton.quiet} px-1 py-0.5 text-xs`} onClick={editWebLink}>
                    Edit<span className="sr-only"> web link</span>
                  </button>
                </p>
              </div>

              <div>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="product-price" label={`Price${money}`} required error={fieldErrors.price ? "Add the price shoppers will pay." : undefined}>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      className={numberInput}
                      value={form.price}
                      onChange={(e) => {
                        setForm((p) => ({ ...p, price: e.target.value }));
                        if (fieldErrors.price) setFieldErrors((f) => ({ ...f, price: false }));
                      }}
                    />
                  </Field>
                  <Field id="product-cost" label={`What it costs you${money}`} optional>
                    <input type="number" min="0" step="0.01" inputMode="decimal" className={numberInput} {...text("costPrice")} />
                  </Field>
                </div>
                <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  {form.costPrice ? (
                    <>
                      You make <span className="font-semibold text-slate-900">{formatCurrency(profit, homeCurrency ?? (form.currency || null))}</span> on
                      each one ({margin.toFixed(1)}% margin).
                    </>
                  ) : (
                    <>Add what it costs you to see your profit on each sale.</>
                  )}{" "}
                  <span className="text-slate-600">Only you can see this, never your customers.</span>
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  id="product-stock"
                  label="How many you have"
                  hint={form.variants.length ? "Sizes and colours have their own counts below." : "The number you have ready to sell right now."}
                >
                  <input type="number" min="0" inputMode="numeric" className={numberInput} {...text("stock")} />
                </Field>
                <Field id="product-category" label="Category" optional hint="For example: Dresses, Shoes or Skincare.">
                  <input className={dashInput} {...text("category")} />
                </Field>
              </div>

              <Field id="product-description" label="Description" optional hint="What is it, what is it made of, and why will people love it?">
                <textarea rows={4} className={dashInput} {...text("description")} />
              </Field>
            </div>

            <div className="space-y-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">More details</h3>
                <p className="text-sm text-slate-600">All optional. Open a section only if you need it.</p>
              </div>

              <Section
                id="variants"
                title="Sizes, colours and other options"
                description="If it comes in different sizes, colours or styles, each with its own stock."
                badge={form.variants.length ? <DashPill tone="blue">{form.variants.length} added</DashPill> : null}
                open={!!openSections.variants}
                onToggle={(o) => setSection("variants", o)}
              >
                <div className="space-y-3">
                  {form.variants.length === 0 && (
                    <p className="text-sm text-slate-600">No options yet. Add one for each size, colour or style you sell.</p>
                  )}
                  {form.variants.map((variant, i) => (
                    <fieldset key={i} className="min-w-0 rounded-xl border border-slate-200 px-4 pb-4 pt-2">
                      <legend className="px-1 text-sm font-semibold text-slate-900">Option {i + 1}</legend>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field
                          id={`variant-${i}-options`}
                          label="What makes it different"
                          hint="Write each as Name=Value, separated by commas. For example: Colour=Red, Size=M"
                          className="sm:col-span-2"
                        >
                          <input className={dashInput} value={variant.optionsText} onChange={(e) => updateVariant(i, { optionsText: e.target.value })} />
                        </Field>
                        <Field id={`variant-${i}-stock`} label="How many you have">
                          <input type="number" inputMode="numeric" className={numberInput} value={variant.stock} onChange={(e) => updateVariant(i, { stock: e.target.value })} />
                        </Field>
                        <Field id={`variant-${i}-price`} label={`Different price${money}`} optional hint="Leave blank to use the main price.">
                          <input
                            type="number"
                            inputMode="decimal"
                            className={numberInput}
                            value={variant.priceOverride}
                            onChange={(e) => updateVariant(i, { priceOverride: e.target.value })}
                          />
                        </Field>
                        <Field id={`variant-${i}-sale`} label={`Sale price${money}`} optional hint="Runs on the sale times under 'Run a sale'.">
                          <input
                            type="number"
                            inputMode="decimal"
                            className={numberInput}
                            value={variant.salePrice}
                            onChange={(e) => updateVariant(i, { salePrice: e.target.value })}
                          />
                        </Field>
                        <Field id={`variant-${i}-sku`} label="Stock code (SKU)" optional>
                          <input className={dashInput} value={variant.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} />
                        </Field>
                        <Field id={`variant-${i}-barcode`} label="Barcode" optional>
                          <input className={dashInput} value={variant.barcode} onChange={(e) => updateVariant(i, { barcode: e.target.value })} />
                        </Field>
                        <Field id={`variant-${i}-weight`} label="Weight (kg)" optional>
                          <input
                            type="number"
                            step="0.001"
                            inputMode="decimal"
                            className={numberInput}
                            value={variant.weightKg}
                            onChange={(e) => updateVariant(i, { weightKg: e.target.value })}
                          />
                        </Field>
                        <Field id={`variant-${i}-image`} label="Photo link" optional hint="A web address for a photo of this option.">
                          <input className={dashInput} value={variant.imageUrl} onChange={(e) => updateVariant(i, { imageUrl: e.target.value })} />
                        </Field>
                      </div>
                      <div className="mt-3 flex justify-end">
                        <button type="button" className={dashButton.danger} onClick={() => removeVariant(i)}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                          Remove<span className="sr-only"> option {i + 1}</span>
                        </button>
                      </div>
                    </fieldset>
                  ))}
                  <button type="button" className={dashButton.secondary} onClick={addVariant}>
                    <Plus className="h-4 w-4" aria-hidden />
                    Add an option
                  </button>
                </div>
              </Section>

              <Section
                id="pricing"
                title="Sale price and more pricing"
                description="Run a sale for a set time, show a 'was' price, set VAT, a minimum order or prices in other currencies."
                open={!!openSections.pricing}
                onToggle={(o) => setSection("pricing", o)}
              >
                <fieldset className="mb-4 rounded-xl border border-slate-200 p-4">
                  <legend className="px-1 text-sm font-medium text-slate-800">Run a sale</legend>
                  <p className="mb-3 text-sm text-slate-600">
                    The sale price shows, with your normal price crossed out, only between these times. It switches itself on and off. Part of the Standard plan.
                  </p>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Field id="product-sale-price" label={`Sale price${money}`} optional hint="Lower than your normal price.">
                      <input type="number" min="0" step="0.01" inputMode="decimal" className={numberInput} {...text("salePrice")} />
                    </Field>
                    <Field id="product-sale-starts" label="Sale starts" optional hint="Leave empty to start now.">
                      <input type="datetime-local" className={dashInput} {...text("saleStartsAt")} />
                    </Field>
                    <Field id="product-sale-ends" label="Sale ends" optional hint="Leave empty to keep it running.">
                      <input type="datetime-local" className={dashInput} {...text("saleEndsAt")} />
                    </Field>
                  </div>
                </fieldset>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field
                    id="product-compare-at"
                    label={`Was price${money}`}
                    optional
                    hint="An earlier, higher price shown crossed out next to your normal price all the time."
                  >
                    <input type="number" min="0" step="0.01" inputMode="decimal" className={numberInput} {...text("compareAtPrice")} />
                  </Field>
                  <Field id="product-min-qty" label="Smallest number someone can buy" hint="Usually 1.">
                    <input type="number" min="1" inputMode="numeric" className={numberInput} {...text("minimumOrderQty")} />
                  </Field>
                  <Checkbox label="Charge VAT on this product" checked={form.taxable} onChange={set("taxable")} />
                  <Field id="product-tax-class" label="VAT rate" hint="Only matters if you've switched VAT on in Payments and plan.">
                    <select id="product-tax-class" className={dashInput} value={form.taxClass || "standard"} onChange={(e) => setForm((p) => ({ ...p, taxClass: e.target.value }))}>
                      {Object.entries(TAX_CLASS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {currencyInfo ? (
                    <ProductCurrencyPrices info={currencyInfo} basePrice={Number(form.price) || 0} value={fixedPrices} onChange={setFixedPrices} />
                  ) : null}
                </div>
              </Section>

              <Section
                id="stock"
                title="Stock and delivery details"
                description="Low-stock warnings, where you keep it, size and weight, and extra delivery charges."
                open={!!openSections.stock}
                onToggle={(o) => setSection("stock", o)}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="product-reorder" label="Warn me when stock falls to" hint="We'll mark it 'Running low' at this number.">
                    <input type="number" min="0" inputMode="numeric" className={numberInput} {...text("reorderLevel")} />
                  </Field>
                  <Field id="product-unit" label="Sold by the" hint="For example: piece, pair, pack, kg or metre.">
                    <input className={dashInput} {...text("unit")} />
                  </Field>
                  <Checkbox
                    label="Keep selling when it's out of stock"
                    hint="Lets shoppers order even when you have none left."
                    checked={form.allowBackorder}
                    onChange={set("allowBackorder")}
                  />
                  <Field
                    id="product-delivery-extra"
                    label={`Extra delivery charge per item${money}`}
                    optional
                    hint="For bulky or heavy items. Added to the delivery fee for each one ordered. Not charged when customers collect."
                  >
                    <input type="number" min="0" step="0.01" inputMode="decimal" placeholder="0" className={numberInput} {...text("deliveryExtra")} />
                  </Field>
                  <Field id="product-supplier" label="Who you buy it from" optional>
                    <input className={dashInput} {...text("supplierName")} />
                  </Field>
                  <Field id="product-location" label="Where you keep it" optional hint="For example: shop shelf B, or the storeroom.">
                    <input className={dashInput} {...text("warehouseLocation")} />
                  </Field>
                  <Field id="product-weight" label="Weight (kg)" optional>
                    <input type="number" min="0" step="0.001" inputMode="decimal" className={numberInput} {...text("weightKg")} />
                  </Field>
                  <Field id="product-dimensions-unit" label="Size measured in" hint="For example: cm or in.">
                    <input className={dashInput} {...text("dimensionsUnit")} />
                  </Field>
                  <fieldset className="sm:col-span-2">
                    <legend className="mb-1 text-sm font-medium text-slate-800">
                      Packed size <span className="font-normal text-slate-500">(optional)</span>
                    </legend>
                    <div className="grid grid-cols-3 gap-3">
                      <Field id="product-length" label="Length" small>
                        <input type="number" min="0" inputMode="decimal" className={numberInput} {...text("lengthCm")} />
                      </Field>
                      <Field id="product-width" label="Width" small>
                        <input type="number" min="0" inputMode="decimal" className={numberInput} {...text("widthCm")} />
                      </Field>
                      <Field id="product-height" label="Height" small>
                        <input type="number" min="0" inputMode="decimal" className={numberInput} {...text("heightCm")} />
                      </Field>
                    </div>
                  </fieldset>
                  <Field id="product-origin" label="Country it was made in" optional>
                    <input className={dashInput} {...text("countryOfOrigin")} />
                  </Field>
                  <Field id="product-hs-code" label="Customs code (HS code)" optional hint="Only needed if you send this product abroad.">
                    <input className={dashInput} {...text("hsCode")} />
                  </Field>
                  <Checkbox
                    label="Track serial numbers"
                    hint="For items that each have their own serial number, such as phones."
                    checked={form.serialTracked}
                    onChange={set("serialTracked")}
                  />
                  <Checkbox
                    label="Track batch or lot numbers"
                    hint="For things made in batches, such as food or cosmetics."
                    checked={form.batchTracked}
                    onChange={set("batchTracked")}
                  />
                </div>
              </Section>

              <Section
                id="returns"
                title="Returns and warranty"
                description="Whether it can be returned, and any guarantee you give."
                open={!!openSections.returns}
                onToggle={(o) => setSection("returns", o)}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Checkbox label="Customers can return this product" checked={form.returnable} onChange={set("returnable")} />
                  <Field id="product-return-days" label="Days they have to return it" optional>
                    <input type="number" min="0" inputMode="numeric" className={numberInput} {...text("returnWindowDays")} />
                  </Field>
                  <Field id="product-warranty" label="Warranty" optional hint="For example: 6-month warranty against faults." className="sm:col-span-2">
                    <input className={dashInput} {...text("warrantyText")} />
                  </Field>
                </div>
              </Section>

              <Section
                id="display"
                title="How it's shown in your shop"
                description="Whether shoppers can see it, and labels like Featured or New."
                open={!!openSections.display}
                onToggle={(o) => setSection("display", o)}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="product-status" label="Status" hint="Draft while you're still getting it ready. Archived when you've stopped selling it.">
                    <Select
                      value={form.status}
                      onChange={(v) => setForm((p) => ({ ...p, status: v as ProductFormState["status"] }))}
                      options={[
                        ["active", "Active"],
                        ["draft", "Draft"],
                        ["archived", "Archived"],
                      ]}
                    />
                  </Field>
                  <Field id="product-visibility" label="Visibility" hint="Hidden keeps it out of your shop without deleting it.">
                    <Select
                      value={form.visibility}
                      onChange={(v) => setForm((p) => ({ ...p, visibility: v as ProductFormState["visibility"] }))}
                      options={[
                        ["visible", "Visible"],
                        ["hidden", "Hidden"],
                        ["scheduled", "Scheduled"],
                      ]}
                    />
                  </Field>
                  <Checkbox label="Featured" checked={form.featured} onChange={set("featured")} />
                  <Checkbox label="New arrival" checked={form.newArrival} onChange={set("newArrival")} />
                  <Checkbox label="Best seller" checked={form.bestSeller} onChange={set("bestSeller")} />
                  <Checkbox label="Take pre-orders" hint="Let people order before it's in stock." checked={form.preorder} onChange={set("preorder")} />
                  <Field id="product-preorder-date" label="Pre-orders available from" optional>
                    <input type="date" className={dashInput} {...text("preorderAvailableDate")} />
                  </Field>
                  <Field id="product-published" label="Date it went on sale" optional>
                    <input type="date" className={dashInput} {...text("publishedAt")} />
                  </Field>
                  <Field id="product-discontinue" label="Stop selling on" optional>
                    <input type="date" className={dashInput} {...text("discontinueAt")} />
                  </Field>
                  <Field id="product-approval" label="Approval" hint="Only needed if someone in your team checks products before they go on sale.">
                    <Select
                      value={form.approvalStatus}
                      onChange={(v) => setForm((p) => ({ ...p, approvalStatus: v as ProductFormState["approvalStatus"] }))}
                      options={[
                        ["approved", "Approved"],
                        ["pending_review", "Waiting for review"],
                        ["draft", "Draft"],
                      ]}
                    />
                  </Field>
                </div>
              </Section>

              <Section
                id="seo"
                title="Search engines and sharing"
                description="The product's web link, and how it looks on Google and when shared."
                open={!!openSections.seo}
                onToggle={(o) => setSection("seo", o)}
              >
                <div className="grid grid-cols-1 gap-4">
                  <Field
                    id="product-slug"
                    label="Web link"
                    hint={`${webLinkPath}${webLinkSlug || "…"}. Use lowercase letters, numbers and hyphens. Changing it can break links you've already shared.`}
                  >
                    <input
                      className={dashInput}
                      autoComplete="off"
                      spellCheck={false}
                      value={form.slug}
                      onChange={(e) => {
                        const value = e.target.value;
                        setSlugTouched(value.trim() !== "" || Boolean(form.id));
                        setForm((p) => ({ ...p, slug: value }));
                      }}
                    />
                  </Field>
                  <Field id="product-short-description" label="Short summary" optional hint="One line about the product. Search engines and shared links show this.">
                    <input className={dashInput} {...text("shortDescription")} />
                  </Field>
                  <Field id="product-meta-title" label="Title for search engines" optional hint="Leave blank to use the product name.">
                    <input className={dashInput} {...text("metaTitle")} />
                  </Field>
                  <Field id="product-meta-description" label="Description for search engines" optional>
                    <textarea rows={2} className={dashInput} {...text("metaDescription")} />
                  </Field>
                  <Field id="product-structured-data" label="Search engine product type" hint="Leave this as 'Product' unless you've been told otherwise.">
                    <input className={dashInput} {...text("structuredDataType")} />
                  </Field>
                </div>
              </Section>

              <Section
                id="codes"
                title="Product codes"
                description="Stock codes and barcodes. Optional: only fill these in if you use them."
                open={!!openSections.codes}
                onToggle={(o) => setSection("codes", o)}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="product-sku" label="Stock code (SKU)" optional hint="Your own code for keeping track of stock.">
                    <input className={dashInput} {...text("sku")} />
                  </Field>
                  <Field id="product-barcode" label="Barcode" optional hint="The number under the barcode on the packaging.">
                    <input className={dashInput} {...text("barcode")} />
                  </Field>
                  <Field
                    id="product-gtin"
                    label="GTIN"
                    optional
                    hint="The global product number from the maker (often the same as the barcode). Helps Google match your product."
                  >
                    <input className={dashInput} {...text("gtin")} />
                  </Field>
                  <Field id="product-mpn" label="Maker's part number (MPN)" optional hint="The model or part number the manufacturer uses.">
                    <input className={dashInput} {...text("mpn")} />
                  </Field>
                </div>
              </Section>

              <Section
                id="more"
                title="More about this product"
                description="Brand, type, condition, tags and videos."
                open={!!openSections.more}
                onToggle={(o) => setSection("more", o)}
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field id="product-brand" label="Brand" optional>
                    <input className={dashInput} {...text("brand")} />
                  </Field>
                  <Field id="product-subcategory" label="Subcategory" optional hint="A smaller group inside the category, such as Maxi dresses.">
                    <input className={dashInput} {...text("subcategory")} />
                  </Field>
                  <Field id="product-type" label="What kind of product is it?">
                    <Select
                      value={form.productType}
                      onChange={(v) => setForm((p) => ({ ...p, productType: v as ProductFormState["productType"] }))}
                      options={[
                        ["physical", "Something I deliver or hand over"],
                        ["digital", "A download"],
                        ["service", "A service"],
                        ["subscription", "A subscription"],
                      ]}
                    />
                  </Field>
                  <Field id="product-condition" label="Condition">
                    <Select
                      value={form.condition}
                      onChange={(v) => setForm((p) => ({ ...p, condition: v as ProductFormState["condition"] }))}
                      options={[
                        ["new", "New"],
                        ["used", "Used"],
                        ["refurbished", "Refurbished"],
                      ]}
                    />
                  </Field>
                  <Field id="product-tags" label="Tags" optional hint="Words that help people find it, separated by commas. For example: summer, cotton, gift." className="sm:col-span-2">
                    <input className={dashInput} {...text("tags")} />
                  </Field>
                  <Field id="product-videos" label="Video links" optional hint="One web address per line, for example a YouTube link." className="sm:col-span-2">
                    <textarea rows={2} className={dashInput} {...text("videoUrls")} />
                  </Field>
                </div>
              </Section>
            </div>
          </div>

          <div className="shrink-0 space-y-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-6">
            {error ? <DashAlert message={error} /> : null}
            <DialogFooter>
              <button type="button" className={dashButton.secondary} onClick={() => setDialogOpen(false)}>
                Cancel
              </button>
              <button type="button" className={dashButton.primary} onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : form.id ? "Save product" : "Add product"}
              </button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const checkboxClass =
  "h-5 w-5 shrink-0 rounded border-slate-300 accent-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";

function RowCheckbox({
  product,
  checked,
  onChange,
  className = "",
}: {
  product: DashboardProduct;
  checked: boolean;
  onChange: (id: string, on: boolean) => void;
  className?: string;
}) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(product.id, e.target.checked)}
      aria-label={`Select ${product.name}`}
      className={`${checkboxClass} ${className}`}
    />
  );
}

/** "Select all on this page", showing a part-ticked state when only some are ticked. */
function SelectAllOnPage({
  products,
  selected,
  onToggle,
  compact,
  className,
}: {
  products: DashboardProduct[];
  selected: Set<string>;
  onToggle: (on: boolean) => void;
  compact?: boolean;
  className?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLInputElement>(null);
  const ticked = products.filter((p) => selected.has(p.id)).length;
  const all = products.length > 0 && ticked === products.length;
  const some = ticked > 0 && !all;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = some;
  }, [some]);

  const input = (
    <input
      ref={ref}
      id={id}
      type="checkbox"
      checked={all}
      onChange={(e) => onToggle(e.target.checked)}
      aria-label={compact ? "Select all products on this page" : undefined}
      className={checkboxClass}
    />
  );
  if (compact) return input;
  return (
    <div className={className}>
      {input}
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        Select all on this page
      </label>
    </div>
  );
}

function ProductThumb({ product, size }: { product: DashboardProduct; size: string }) {
  if (product.imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={product.imageUrl} alt="" className={`${size} shrink-0 rounded-xl border border-slate-200 object-cover`} />;
  }
  return (
    <span aria-hidden className={`${size} flex shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-400`}>
      <ImageIcon className="h-5 w-5" />
    </span>
  );
}

function PhotoDropArea({
  compact,
  uploading,
  dragging,
  setDragging,
  onFiles,
  onClick,
}: {
  compact?: boolean;
  uploading: boolean;
  dragging: boolean;
  setDragging: (value: boolean) => void;
  onFiles: (files: File[]) => void;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={uploading}
      aria-describedby="product-photos-hint"
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const files = Array.from(e.dataTransfer.files || []);
        if (files.length) onFiles(files);
      }}
      className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2 disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none ${
        compact ? "px-4 py-4" : "px-6 py-10"
      } ${dragging ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/50"}`}
    >
      <ImagePlus className={`${compact ? "h-5 w-5" : "h-8 w-8"} text-blue-700`} aria-hidden />
      <span className={`${compact ? "text-sm" : "text-base"} font-semibold text-slate-900`}>{compact ? "Add more photos" : "Add photos"}</span>
      <span className="text-sm text-slate-600">Drag photos here, or tap to choose them.</span>
    </button>
  );
}

function Section({
  id,
  title,
  description,
  badge,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  description: string;
  badge?: React.ReactNode;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <details
      id={`product-section-${id}`}
      open={open}
      onToggle={(e) => onToggle(e.currentTarget.open)}
      className="group rounded-2xl border border-slate-200 bg-white"
    >
      <summary className="flex cursor-pointer list-none items-start gap-3 rounded-2xl px-4 py-3.5 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-slate-900">{title}</span>
          <span className="mt-0.5 block text-sm text-slate-600">{description}</span>
        </span>
        {badge ? <span className="mt-0.5 shrink-0">{badge}</span> : null}
        <ChevronDown
          aria-hidden
          className="mt-0.5 h-5 w-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-t border-slate-100 px-4 py-4">{children}</div>
    </details>
  );
}

/**
 * A labelled form control. The single child gets the id, and is pointed at its
 * hint and any error so screen readers read them out.
 */
function Field({
  id,
  label,
  hint,
  error,
  required,
  optional,
  small,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  optional?: boolean;
  small?: boolean;
  className?: string;
  children: React.ReactElement;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement> & { required?: boolean }>, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        "aria-required": required || undefined,
      })
    : children;

  return (
    <div className={`min-w-0 ${className || ""}`}>
      <label htmlFor={id} className={`mb-1 block font-medium ${small ? "text-xs text-slate-700" : "text-sm text-slate-800"}`}>
        {label}
        {required ? (
          <span className="text-red-700" aria-hidden>
            {" "}
            *
          </span>
        ) : null}
        {optional ? <span className="font-normal text-slate-500"> (optional)</span> : null}
      </label>
      {control}
      {hint ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-slate-600">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Checkbox({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-3 self-center">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 accent-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2"
      />
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-slate-800">
          {label}
        </label>
        {hint ? (
          <p id={`${id}-hint`} className="text-xs text-slate-600">
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
} & Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange">) {
  return (
    <select {...rest} value={value} onChange={(e) => onChange(e.target.value)} className={dashInput}>
      {options.map(([val, label]) => (
        <option key={val} value={val}>
          {label}
        </option>
      ))}
    </select>
  );
}
