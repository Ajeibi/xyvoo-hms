"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Upload, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastInfo, toastSuccess } from "@/lib/app-toast";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DashboardProduct } from "@/lib/store/products";
import type { StoreRoleCapabilities } from "@/lib/store/access";

type VariantFormRow = {
  optionsText: string;
  sku: string;
  priceOverride: string;
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

function formatCurrency(value: number, currency: string | null) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency || "NGN",
    maximumFractionDigits: 2,
  }).format(value);
}

const STOCK_BADGE: Record<DashboardProduct["stockStatus"], string> = {
  "in-stock": "bg-emerald-50 text-emerald-700",
  "low-stock": "bg-amber-50 text-amber-700",
  "out-of-stock": "bg-red-50 text-red-700",
};

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
  const [importing, setImporting] = useState(false);
  const [importSkipped, setImportSkipped] = useState<{ row: number; reason: string }[] | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  async function loadProducts() {
    try {
      const res = await fetch(`/api/store/products/list?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) throw new Error("Failed to load products.");
      const json = await res.json();
      setProducts(json.products || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/store/products/list?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) throw new Error("Failed to load products.");
        const json = await res.json();
        if (!cancelled) setProducts(json.products || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  function openCreate() {
    setForm(EMPTY_FORM);
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
        optionsText: formatOptionsText(v.options || {}),
        sku: v.sku || "",
        priceOverride: v.price_override != null ? String(v.price_override) : "",
        stock: String(v.stock ?? 0),
        barcode: v.barcode || "",
        weightKg: v.weight_kg != null ? String(v.weight_kg) : "",
        imageUrl: v.image_url || "",
      })),
    });
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  }

  async function handleProductImport(file: File) {
    const isExcel = /\.xlsx?$/i.test(file.name);
    const endpoint = isExcel ? "/api/store/products/import/excel" : "/api/store/products/import/csv";

    setImporting(true);
    setError(null);
    setImportSkipped(null);
    try {
      const body = new FormData();
      body.append("slug", slug);
      body.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to import products.");

      const imported = json.imported || 0;
      const skipped = (json.skipped || []) as { row: number; reason: string }[];

      if (skipped.length === 0) {
        toastSuccess("Import complete", `Added ${imported} ${imported === 1 ? "product" : "products"}.`);
      } else {
        setImportSkipped(skipped);
        toastInfo(
          "Import finished with some rows skipped",
          `Added ${imported} ${imported === 1 ? "product" : "products"}. Skipped ${skipped.length} row${skipped.length === 1 ? "" : "s"} — see details below.`,
        );
      }

      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import products.");
    } finally {
      setImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
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
      variants: [...prev.variants, { optionsText: "", sku: "", priceOverride: "", stock: "0", barcode: "", weightKg: "", imageUrl: "" }],
    }));
  }

  function removeVariant(index: number) {
    setForm((prev) => ({ ...prev, variants: prev.variants.filter((_, i) => i !== index) }));
  }

  function removeGalleryImage(index: number) {
    setForm((prev) => ({ ...prev, gallery: prev.gallery.filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    if (!form.name.trim() || !form.price) {
      setError("Name and price are required.");
      return;
    }

    setSaving(true);
    setError(null);

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
      cost_price: form.costPrice ? Number(form.costPrice) : null,
      currency: form.currency.trim() || null,
      taxable: form.taxable,
      tax_class: form.taxClass.trim() || null,
      minimum_order_qty: Number(form.minimumOrderQty) || 1,

      // Inventory & shipping
      stock: Number(form.stock) || 0,
      reorder_level: Number(form.reorderLevel) || 10,
      unit: form.unit.trim() || "piece",
      allow_backorder: form.allowBackorder,
      supplier_name: form.supplierName.trim() || null,
      warehouse_location: form.warehouseLocation.trim() || null,
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
        options: parseOptionsText(v.optionsText),
        sku: v.sku.trim() || undefined,
        price_override: v.priceOverride ? Number(v.priceOverride) : undefined,
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
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete product.");
    }
  }

  const price = Number(form.price) || 0;
  const cost = Number(form.costPrice) || 0;
  const profit = price - cost;
  const margin = price > 0 ? (profit / price) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900">Products</h1>
        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleProductImport(file);
            }}
          />
          {capabilities.canImportProducts ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={importing}
              onClick={() => importInputRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              {importing ? "Importing…" : "Import CSV/Excel"}
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add product
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {importSkipped && importSkipped.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium text-amber-900">
              {importSkipped.length} row{importSkipped.length === 1 ? "" : "s"} skipped during import
            </p>
            <button
              type="button"
              onClick={() => setImportSkipped(null)}
              className="shrink-0 text-xs font-medium text-amber-700 hover:text-amber-900"
            >
              Dismiss
            </button>
          </div>
          <ul className="mt-2 space-y-1 text-amber-800">
            {importSkipped.slice(0, 20).map((s) => (
              <li key={s.row}>
                Row {s.row}: {s.reason}
              </li>
            ))}
          </ul>
          {importSkipped.length > 20 ? (
            <p className="mt-2 text-xs text-amber-700">…and {importSkipped.length - 20} more.</p>
          ) : null}
        </div>
      ) : null}

      {!products ? (
        <p className="text-sm text-slate-500">Loading products…</p>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">
          No products yet. Add your first product or import a CSV/Excel file to get started.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-4 py-3">Product</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Profit</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-slate-50 last:border-0">
                  <td className="flex items-center gap-3 px-4 py-3">
                    {product.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="h-9 w-9 rounded-lg border border-slate-100 object-cover"
                      />
                    ) : (
                      <div className="h-9 w-9 rounded-lg bg-slate-100" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium text-slate-800">{product.name}</p>
                      <div className="flex gap-1">
                        {product.featured && <span className="text-[10px] text-amber-600">★ Featured</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{product.sku || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{product.category || "—"}</td>
                  <td className="px-4 py-3 text-slate-800">
                    {formatCurrency(product.sellingPrice, product.currency)}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatCurrency(product.profit, product.currency)} ({product.profitMargin.toFixed(0)}%)
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STOCK_BADGE[product.stockStatus]}`}>
                      {product.stock} in stock
                    </span>
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-500">{product.status}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(product)}>
                        Edit
                      </Button>
                      {capabilities.canDeleteProducts ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-red-500"
                          onClick={() => handleDelete(product)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{form.id ? "Edit product" : "Add product"}</DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="basic">
            <TabsList>
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="pricing">Pricing</TabsTrigger>
              <TabsTrigger value="inventory">Inventory & shipping</TabsTrigger>
              <TabsTrigger value="media">Media & SEO</TabsTrigger>
              <TabsTrigger value="merchandising">Merchandising</TabsTrigger>
              <TabsTrigger value="variants">Variants</TabsTrigger>
            </TabsList>

            <TabsContent value="basic">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Name" required className="sm:col-span-2">
                  <Input value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
                </Field>
                <Field label="URL slug">
                  <Input value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} />
                </Field>
                <Field label="SKU">
                  <Input value={form.sku} onChange={(e) => setForm((p) => ({ ...p, sku: e.target.value }))} />
                </Field>
                <Field label="Short description" className="sm:col-span-2">
                  <Input
                    value={form.shortDescription}
                    onChange={(e) => setForm((p) => ({ ...p, shortDescription: e.target.value }))}
                  />
                </Field>
                <Field label="Description" className="sm:col-span-2">
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-300"
                  />
                </Field>
                <Field label="Brand">
                  <Input value={form.brand} onChange={(e) => setForm((p) => ({ ...p, brand: e.target.value }))} />
                </Field>
                <Field label="Category">
                  <Input value={form.category} onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))} />
                </Field>
                <Field label="Subcategory">
                  <Input
                    value={form.subcategory}
                    onChange={(e) => setForm((p) => ({ ...p, subcategory: e.target.value }))}
                  />
                </Field>
                <Field label="Tags (comma separated)">
                  <Input value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} />
                </Field>
                <Field label="Barcode">
                  <Input value={form.barcode} onChange={(e) => setForm((p) => ({ ...p, barcode: e.target.value }))} />
                </Field>
                <Field label="GTIN">
                  <Input value={form.gtin} onChange={(e) => setForm((p) => ({ ...p, gtin: e.target.value }))} />
                </Field>
                <Field label="MPN">
                  <Input value={form.mpn} onChange={(e) => setForm((p) => ({ ...p, mpn: e.target.value }))} />
                </Field>
                <Field label="Product type">
                  <Select
                    value={form.productType}
                    onChange={(v) => setForm((p) => ({ ...p, productType: v as ProductFormState["productType"] }))}
                    options={[
                      ["physical", "Physical"],
                      ["digital", "Digital"],
                      ["service", "Service"],
                      ["subscription", "Subscription"],
                    ]}
                  />
                </Field>
                <Field label="Condition">
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
                <Field label="Status">
                  <Select
                    value={form.status}
                    onChange={(v) => setForm((p) => ({ ...p, status: v as ProductFormState["status"] }))}
                    options={[
                      ["draft", "Draft"],
                      ["active", "Active"],
                      ["archived", "Archived"],
                    ]}
                  />
                </Field>
                <Field label="Visibility">
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
              </div>
            </TabsContent>

            <TabsContent value="pricing">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Price" required>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))}
                  />
                </Field>
                <Field label="Compare-at price">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.compareAtPrice}
                    onChange={(e) => setForm((p) => ({ ...p, compareAtPrice: e.target.value }))}
                  />
                </Field>
                <Field label="Cost price">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.costPrice}
                    onChange={(e) => setForm((p) => ({ ...p, costPrice: e.target.value }))}
                  />
                </Field>
                <Field label="Currency">
                  <Input
                    placeholder="NGN"
                    value={form.currency}
                    onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                  />
                </Field>
                <Field label="Tax class">
                  <Input value={form.taxClass} onChange={(e) => setForm((p) => ({ ...p, taxClass: e.target.value }))} />
                </Field>
                <Field label="Minimum order quantity">
                  <Input
                    type="number"
                    min="1"
                    value={form.minimumOrderQty}
                    onChange={(e) => setForm((p) => ({ ...p, minimumOrderQty: e.target.value }))}
                  />
                </Field>
                <Checkbox
                  label="Taxable"
                  checked={form.taxable}
                  onChange={(v) => setForm((p) => ({ ...p, taxable: v }))}
                />
                <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 sm:col-span-2">
                  Profit: <span className="font-medium text-slate-900">{formatCurrency(profit, form.currency || null)}</span>{" "}
                  ({margin.toFixed(1)}% margin) — vendor-only, never shown to customers.
                </div>
              </div>
            </TabsContent>

            <TabsContent value="inventory">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Stock">
                  <Input
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={(e) => setForm((p) => ({ ...p, stock: e.target.value }))}
                  />
                </Field>
                <Field label="Reorder level">
                  <Input
                    type="number"
                    min="0"
                    value={form.reorderLevel}
                    onChange={(e) => setForm((p) => ({ ...p, reorderLevel: e.target.value }))}
                  />
                </Field>
                <Field label="Unit">
                  <Input value={form.unit} onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))} />
                </Field>
                <Checkbox
                  label="Allow backorder"
                  checked={form.allowBackorder}
                  onChange={(v) => setForm((p) => ({ ...p, allowBackorder: v }))}
                />
                <Field label="Supplier name">
                  <Input
                    value={form.supplierName}
                    onChange={(e) => setForm((p) => ({ ...p, supplierName: e.target.value }))}
                  />
                </Field>
                <Field label="Warehouse / location">
                  <Input
                    value={form.warehouseLocation}
                    onChange={(e) => setForm((p) => ({ ...p, warehouseLocation: e.target.value }))}
                  />
                </Field>
                <Field label="Weight (kg)">
                  <Input
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.weightKg}
                    onChange={(e) => setForm((p) => ({ ...p, weightKg: e.target.value }))}
                  />
                </Field>
                <Field label="Dimensions unit">
                  <Input
                    value={form.dimensionsUnit}
                    onChange={(e) => setForm((p) => ({ ...p, dimensionsUnit: e.target.value }))}
                  />
                </Field>
                <Field label="Length">
                  <Input
                    type="number"
                    min="0"
                    value={form.lengthCm}
                    onChange={(e) => setForm((p) => ({ ...p, lengthCm: e.target.value }))}
                  />
                </Field>
                <Field label="Width">
                  <Input
                    type="number"
                    min="0"
                    value={form.widthCm}
                    onChange={(e) => setForm((p) => ({ ...p, widthCm: e.target.value }))}
                  />
                </Field>
                <Field label="Height">
                  <Input
                    type="number"
                    min="0"
                    value={form.heightCm}
                    onChange={(e) => setForm((p) => ({ ...p, heightCm: e.target.value }))}
                  />
                </Field>
                <Field label="Country of origin">
                  <Input
                    value={form.countryOfOrigin}
                    onChange={(e) => setForm((p) => ({ ...p, countryOfOrigin: e.target.value }))}
                  />
                </Field>
                <Field label="HS code">
                  <Input value={form.hsCode} onChange={(e) => setForm((p) => ({ ...p, hsCode: e.target.value }))} />
                </Field>
                <Checkbox
                  label="Serial number tracked"
                  checked={form.serialTracked}
                  onChange={(v) => setForm((p) => ({ ...p, serialTracked: v }))}
                />
                <Checkbox
                  label="Batch/lot tracked"
                  checked={form.batchTracked}
                  onChange={(v) => setForm((p) => ({ ...p, batchTracked: v }))}
                />
                <Checkbox
                  label="Returnable"
                  checked={form.returnable}
                  onChange={(v) => setForm((p) => ({ ...p, returnable: v }))}
                />
                <Field label="Return window (days)">
                  <Input
                    type="number"
                    min="0"
                    value={form.returnWindowDays}
                    onChange={(e) => setForm((p) => ({ ...p, returnWindowDays: e.target.value }))}
                  />
                </Field>
                <Field label="Warranty" className="sm:col-span-2">
                  <Input
                    value={form.warrantyText}
                    onChange={(e) => setForm((p) => ({ ...p, warrantyText: e.target.value }))}
                  />
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="media">
              <div className="space-y-4">
                <Field label="Main image">
                  <div className="flex items-center gap-3">
                    {form.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={form.imageUrl}
                        alt="Product"
                        className="h-12 w-12 rounded-lg border border-slate-100 object-cover"
                      />
                    )}
                    <input
                      ref={imageInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, "main");
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      onClick={() => imageInputRef.current?.click()}
                    >
                      <UploadCloud className="h-4 w-4" />
                      {uploading ? "Uploading…" : "Upload image"}
                    </Button>
                  </div>
                </Field>

                <Field label="Gallery">
                  <div className="space-y-2">
                    {form.gallery.map((img, i) => (
                      <div key={i} className="flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img.url} alt="" className="h-9 w-9 rounded-lg border border-slate-100 object-cover" />
                        <Input
                          placeholder="Alt text"
                          value={img.alt}
                          onChange={(e) =>
                            setForm((p) => ({
                              ...p,
                              gallery: p.gallery.map((g, gi) => (gi === i ? { ...g, alt: e.target.value } : g)),
                            }))
                          }
                        />
                        <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeGalleryImage(i)}>
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                    <input
                      ref={galleryInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file, "gallery");
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      onClick={() => galleryInputRef.current?.click()}
                    >
                      <Plus className="h-4 w-4" />
                      Add gallery image
                    </Button>
                  </div>
                </Field>

                <Field label="Video URLs (one per line)">
                  <textarea
                    value={form.videoUrls}
                    onChange={(e) => setForm((p) => ({ ...p, videoUrls: e.target.value }))}
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm outline-none focus:border-blue-300"
                  />
                </Field>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Meta title">
                    <Input value={form.metaTitle} onChange={(e) => setForm((p) => ({ ...p, metaTitle: e.target.value }))} />
                  </Field>
                  <Field label="Structured data type">
                    <Input
                      value={form.structuredDataType}
                      onChange={(e) => setForm((p) => ({ ...p, structuredDataType: e.target.value }))}
                    />
                  </Field>
                  <Field label="Meta description" className="sm:col-span-2">
                    <Input
                      value={form.metaDescription}
                      onChange={(e) => setForm((p) => ({ ...p, metaDescription: e.target.value }))}
                    />
                  </Field>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="merchandising">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Checkbox label="Featured" checked={form.featured} onChange={(v) => setForm((p) => ({ ...p, featured: v }))} />
                <Checkbox
                  label="New arrival"
                  checked={form.newArrival}
                  onChange={(v) => setForm((p) => ({ ...p, newArrival: v }))}
                />
                <Checkbox
                  label="Best seller"
                  checked={form.bestSeller}
                  onChange={(v) => setForm((p) => ({ ...p, bestSeller: v }))}
                />
                <Checkbox label="Preorder" checked={form.preorder} onChange={(v) => setForm((p) => ({ ...p, preorder: v }))} />
                <Field label="Preorder available date">
                  <Input
                    type="date"
                    value={form.preorderAvailableDate}
                    onChange={(e) => setForm((p) => ({ ...p, preorderAvailableDate: e.target.value }))}
                  />
                </Field>
                <Field label="Approval status">
                  <Select
                    value={form.approvalStatus}
                    onChange={(v) => setForm((p) => ({ ...p, approvalStatus: v as ProductFormState["approvalStatus"] }))}
                    options={[
                      ["draft", "Draft"],
                      ["pending_review", "Pending review"],
                      ["approved", "Approved"],
                    ]}
                  />
                </Field>
                <Field label="Published date">
                  <Input
                    type="date"
                    value={form.publishedAt}
                    onChange={(e) => setForm((p) => ({ ...p, publishedAt: e.target.value }))}
                  />
                </Field>
                <Field label="Discontinue date">
                  <Input
                    type="date"
                    value={form.discontinueAt}
                    onChange={(e) => setForm((p) => ({ ...p, discontinueAt: e.target.value }))}
                  />
                </Field>
              </div>
            </TabsContent>

            <TabsContent value="variants">
              <div className="space-y-3">
                {form.variants.length === 0 && (
                  <p className="text-sm text-slate-500">
                    No variants. Add one if this product comes in options like size or color.
                  </p>
                )}
                {form.variants.map((variant, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-6">
                    <Field label="Options (e.g. Color=Red, Size=M)" className="sm:col-span-2">
                      <Input
                        value={variant.optionsText}
                        onChange={(e) => updateVariant(i, { optionsText: e.target.value })}
                      />
                    </Field>
                    <Field label="SKU">
                      <Input value={variant.sku} onChange={(e) => updateVariant(i, { sku: e.target.value })} />
                    </Field>
                    <Field label="Price override">
                      <Input
                        type="number"
                        value={variant.priceOverride}
                        onChange={(e) => updateVariant(i, { priceOverride: e.target.value })}
                      />
                    </Field>
                    <Field label="Stock">
                      <Input
                        type="number"
                        value={variant.stock}
                        onChange={(e) => updateVariant(i, { stock: e.target.value })}
                      />
                    </Field>
                    <div className="flex items-end justify-end">
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeVariant(i)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                    <Field label="Barcode">
                      <Input value={variant.barcode} onChange={(e) => updateVariant(i, { barcode: e.target.value })} />
                    </Field>
                    <Field label="Weight (kg)">
                      <Input
                        type="number"
                        step="0.001"
                        value={variant.weightKg}
                        onChange={(e) => updateVariant(i, { weightKg: e.target.value })}
                      />
                    </Field>
                    <Field label="Variant image URL" className="sm:col-span-2">
                      <Input value={variant.imageUrl} onChange={(e) => updateVariant(i, { imageUrl: e.target.value })} />
                    </Field>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addVariant}>
                  <Plus className="h-4 w-4" />
                  Add variant
                </Button>
              </div>
            </TabsContent>
          </Tabs>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save product"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block text-xs font-medium text-slate-500 ${className || ""}`}>
      <span>
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
      {label}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:border-blue-300"
    >
      {options.map(([val, label]) => (
        <option key={val} value={val}>
          {label}
        </option>
      ))}
    </select>
  );
}
