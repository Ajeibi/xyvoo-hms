"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileUp, Search, Trash2, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MAX_BULK_PRODUCTS, PRODUCT_SORTS, type BulkAction, type ProductSort, type StockFilter } from "@/lib/store/product-catalogue";
import { DashAlert, dashButton, dashInput, sendJson } from "./dashboard-ui";

/*
 * The tools around the Products list: search and filters, the bar for
 * changing many products at once, page buttons, and the import dialog with
 * its preview step.
 */

export const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";

export type CollectionOption = { id: string; name: string };

export type ProductFilterValues = {
  q: string;
  status: "" | "active" | "draft" | "archived";
  stock: "" | StockFilter;
  category: string;
  collection: string;
  sort: ProductSort;
};

export const EMPTY_FILTERS: ProductFilterValues = { q: "", status: "", stock: "", category: "", collection: "", sort: "newest" };

export function hasActiveFilters(f: ProductFilterValues) {
  return Boolean(f.q.trim() || f.status || f.stock || f.category || f.collection);
}

function SmallSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-700">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={dashInput}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Search box plus filters. The search box updates as you type; the parent waits a moment before searching. */
export function ProductFilters({
  values,
  onChange,
  categories,
  collections,
}: {
  values: ProductFilterValues;
  onChange: (patch: Partial<ProductFilterValues>) => void;
  categories: string[];
  collections: CollectionOption[];
}) {
  const id = useId();
  const active = hasActiveFilters(values);
  return (
    <section aria-label="Search and filter products" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="min-w-0">
        <label htmlFor={`${id}-q`} className="mb-1 block text-sm font-medium text-slate-800">
          Search products
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" aria-hidden />
          <input
            id={`${id}-q`}
            type="search"
            className={`${dashInput} pl-9`}
            value={values.q}
            onChange={(e) => onChange({ q: e.target.value })}
            aria-describedby={`${id}-q-hint`}
            autoComplete="off"
          />
        </div>
        <p id={`${id}-q-hint`} className="mt-1 text-xs text-slate-600">
          Search by name, stock code (SKU), category or tag.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <SmallSelect
          id={`${id}-status`}
          label="Status"
          value={values.status}
          onChange={(v) => onChange({ status: v as ProductFilterValues["status"] })}
          options={[
            ["", "All statuses"],
            ["active", "Active"],
            ["draft", "Draft"],
            ["archived", "Archived"],
          ]}
        />
        <SmallSelect
          id={`${id}-stock`}
          label="Stock"
          value={values.stock}
          onChange={(v) => onChange({ stock: v as ProductFilterValues["stock"] })}
          options={[
            ["", "Any stock level"],
            ["in-stock", "In stock"],
            ["low-stock", "Running low"],
            ["out-of-stock", "Sold out"],
          ]}
        />
        <SmallSelect
          id={`${id}-category`}
          label="Category"
          value={values.category}
          onChange={(v) => onChange({ category: v })}
          options={[["", "All categories"], ...categories.map((c): [string, string] => [c, c])]}
        />
        {collections.length ? (
          <SmallSelect
            id={`${id}-collection`}
            label="Collection"
            value={values.collection}
            onChange={(v) => onChange({ collection: v })}
            options={[["", "All collections"], ...collections.map((c): [string, string] => [c.id, c.name])]}
          />
        ) : null}
        <SmallSelect
          id={`${id}-sort`}
          label="Sort by"
          value={values.sort}
          onChange={(v) => onChange({ sort: v as ProductSort })}
          options={Object.entries(PRODUCT_SORTS).map(([key, s]): [string, string] => [key, s.label])}
        />
      </div>
      {active ? (
        <button type="button" className={`${dashButton.quiet} ${focusRing}`} onClick={() => onChange({ ...EMPTY_FILTERS, sort: values.sort })}>
          <X className="h-4 w-4" aria-hidden />
          Clear search and filters
        </button>
      ) : null}
    </section>
  );
}

export function Pagination({ page, pageCount, onPage }: { page: number; pageCount: number; onPage: (page: number) => void }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Product pages" className="flex flex-wrap items-center justify-between gap-3">
      <button type="button" className={`${dashButton.secondary} ${focusRing}`} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <ChevronLeft className="h-4 w-4" aria-hidden />
        Previous<span className="sr-only"> page</span>
      </button>
      <p className="text-sm text-slate-700">
        Page {page} of {pageCount}
      </p>
      <button type="button" className={`${dashButton.secondary} ${focusRing}`} disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        Next<span className="sr-only"> page</span>
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </nav>
  );
}

type BulkChoice = "" | "price" | "stock" | "status" | "category" | "collection-add" | "collection-remove" | "delete";
type PriceMode = Extract<BulkAction, { type: "price" }>["mode"];

/** Shown when products are ticked: choose one change and apply it to all of them. */
export function BulkActionBar({
  slug,
  selectedIds,
  categories,
  collections,
  canDelete,
  currencyLabel,
  onDone,
  onClear,
}: {
  slug: string;
  selectedIds: string[];
  categories: string[];
  collections: CollectionOption[];
  canDelete: boolean;
  currencyLabel: string;
  onDone: (message: string, deleted: boolean) => void;
  onClear: () => void;
}) {
  const id = useId();
  const [choice, setChoice] = useState<BulkChoice>("");
  const [priceMode, setPriceMode] = useState<PriceMode>("set");
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"active" | "draft" | "archived">("active");
  const [collectionId, setCollectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const count = selectedIds.length;
  const things = `${count} ${count === 1 ? "product" : "products"}`;

  function buildAction(): BulkAction | string {
    switch (choice) {
      case "price": {
        const n = Number(value);
        if (value.trim() === "" || !Number.isFinite(n) || n < 0) return "Enter an amount of 0 or more.";
        return { type: "price", mode: priceMode, value: n };
      }
      case "stock": {
        const n = Number(value);
        if (value.trim() === "" || !Number.isInteger(n) || n < 0) return "Enter a whole number of 0 or more.";
        return { type: "stock", value: n };
      }
      case "status":
        return { type: "status", value: status };
      case "category":
        return { type: "category", value: value.trim() || null };
      case "collection-add":
      case "collection-remove":
        if (!collectionId) return "Choose a collection.";
        return { type: "collection", op: choice === "collection-add" ? "add" : "remove", collectionId };
      case "delete":
        return { type: "delete" };
      default:
        return "Choose what you'd like to change.";
    }
  }

  async function apply() {
    if (count > MAX_BULK_PRODUCTS) {
      setError(`You can change up to ${MAX_BULK_PRODUCTS} products at a time. Untick some and try again.`);
      return;
    }
    const action = buildAction();
    if (typeof action === "string") {
      setError(action);
      return;
    }
    if (action.type === "delete" && !confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const json = await sendJson("/api/store/products/bulk", "POST", { slug, ids: selectedIds, action });
      setConfirmDelete(false);
      setValue("");
      onDone(typeof json.message === "string" ? json.message : "Done.", action.type === "delete");
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't make that change. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const choices: Array<[BulkChoice, string]> = [
    ["", "Choose a change…"],
    ["price", "Change price"],
    ["stock", "Set stock"],
    ["status", "Set status"],
    ["category", "Set category"],
    ...(collections.length
      ? ([
          ["collection-add", "Add to a collection"],
          ["collection-remove", "Remove from a collection"],
        ] as Array<[BulkChoice, string]>)
      : []),
    ...(canDelete ? ([["delete", "Delete"]] as Array<[BulkChoice, string]>) : []),
  ];

  return (
    <section aria-labelledby={`${id}-title`} className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${id}-title`} className="text-sm font-semibold text-slate-900">
          {things} selected
        </h2>
        <button type="button" className={`${dashButton.quiet} ${focusRing}`} onClick={onClear}>
          Clear selection
        </button>
      </div>

      <form
        className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <SmallSelect
          id={`${id}-choice`}
          label="Change"
          value={choice}
          onChange={(v) => {
            setChoice(v as BulkChoice);
            setValue("");
            setError(null);
            setConfirmDelete(false);
          }}
          options={choices}
        />

        {choice === "price" ? (
          <>
            <SmallSelect
              id={`${id}-price-mode`}
              label="How"
              value={priceMode}
              onChange={(v) => setPriceMode(v as PriceMode)}
              options={[
                ["set", "Set an exact price"],
                ["increase-percent", "Increase by a percentage"],
                ["decrease-percent", "Decrease by a percentage"],
                ["increase-amount", "Increase by an amount"],
                ["decrease-amount", "Decrease by an amount"],
              ]}
            />
            <BulkNumber
              id={`${id}-price`}
              label={priceMode.endsWith("percent") ? "Percentage (%)" : `Amount${currencyLabel}`}
              value={value}
              onChange={setValue}
              step="0.01"
            />
          </>
        ) : null}

        {choice === "stock" ? <BulkNumber id={`${id}-stock`} label="How many each" value={value} onChange={setValue} step="1" /> : null}

        {choice === "status" ? (
          <SmallSelect
            id={`${id}-status`}
            label="New status"
            value={status}
            onChange={(v) => setStatus(v as typeof status)}
            options={[
              ["active", "Active"],
              ["draft", "Draft"],
              ["archived", "Archived"],
            ]}
          />
        ) : null}

        {choice === "category" ? (
          <div className="min-w-0">
            <label htmlFor={`${id}-category`} className="mb-1 block text-xs font-medium text-slate-700">
              New category
            </label>
            <input
              id={`${id}-category`}
              className={dashInput}
              list={`${id}-categories`}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              aria-describedby={`${id}-category-hint`}
            />
            <datalist id={`${id}-categories`}>
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <p id={`${id}-category-hint`} className="mt-1 text-xs text-slate-600">
              Leave blank to remove the category.
            </p>
          </div>
        ) : null}

        {choice === "collection-add" || choice === "collection-remove" ? (
          <SmallSelect
            id={`${id}-collection`}
            label="Collection"
            value={collectionId}
            onChange={setCollectionId}
            options={[["", "Choose a collection…"], ...collections.map((c): [string, string] => [c.id, c.name])]}
          />
        ) : null}

        <div>
          <button type="submit" className={`${choice === "delete" ? dashButton.secondary : dashButton.primary} ${focusRing} w-full sm:w-auto`} disabled={busy || !choice}>
            {choice === "delete" ? <Trash2 className="h-4 w-4 text-red-700" aria-hidden /> : null}
            {busy ? "Saving…" : choice === "delete" ? `Delete ${things}` : `Apply to ${things}`}
          </button>
        </div>
      </form>

      {choice === "stock" ? (
        <p className="text-xs text-slate-600">Products with sizes or colours keep a separate count for each option. Change those in the product itself.</p>
      ) : null}
      {error ? <DashAlert message={error} /> : null}

      <Dialog open={confirmDelete} onOpenChange={(open) => !busy && setConfirmDelete(open)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete {things}?</DialogTitle>
            <DialogDescription className="text-slate-600">
              They&rsquo;ll be removed from your shop and your dashboard. This can&rsquo;t be undone. If you might sell them again, set them to Archived instead.
            </DialogDescription>
          </DialogHeader>
          {error ? <DashAlert message={error} /> : null}
          <DialogFooter>
            <button type="button" className={`${dashButton.secondary} ${focusRing}`} onClick={() => setConfirmDelete(false)} disabled={busy}>
              Keep them
            </button>
            <button
              type="button"
              className={`inline-flex items-center justify-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-800 disabled:opacity-50 ${focusRing}`}
              onClick={apply}
              disabled={busy}
            >
              <Trash2 className="h-4 w-4" aria-hidden />
              {busy ? "Deleting…" : `Delete ${things}`}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function BulkNumber({ id, label, value, onChange, step }: { id: string; label: string; value: string; onChange: (v: string) => void; step: string }) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-slate-700">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min="0"
        step={step}
        inputMode={step === "1" ? "numeric" : "decimal"}
        className={`${dashInput} tabular-nums`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

type ImportPreview = { newCount: number; updatedCount: number; problems: Array<{ row: number; reason: string }>; summary: string };
export type ImportResult = { created: number; updated: number; skipped: Array<{ row: number; reason: string }> };

/**
 * Import in two steps: choose a file and see what will happen ("12 new, 30
 * updated, 3 rows with problems"), then confirm to save.
 */
export function ImportDialog({
  open,
  onOpenChange,
  slug,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  onImported: (result: ImportResult) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [busy, setBusy] = useState<"" | "checking" | "saving">("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  useEffect(() => {
    if (open) return;
    // Start afresh next time the dialog opens.
    const timer = setTimeout(() => {
      setFile(null);
      setPreview(null);
      setError(null);
      setBusy("");
    }, 200);
    return () => clearTimeout(timer);
  }, [open]);

  async function send(chosen: File, mode: "preview" | "save") {
    const isExcel = /\.xlsx$/i.test(chosen.name);
    const body = new FormData();
    body.append("slug", slug);
    body.append("file", chosen);
    body.append("mode", mode);
    const res = await fetch(isExcel ? "/api/store/products/import/excel" : "/api/store/products/import/csv", { method: "POST", body });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof json.error === "string" ? json.error : "We couldn't read that file. Please try again.");
    return json;
  }

  async function check(chosen: File) {
    if (/\.xls$/i.test(chosen.name)) {
      setError("That's an older Excel file (.xls). Please save it as .xlsx or CSV and try again.");
      return;
    }
    setFile(chosen);
    setPreview(null);
    setError(null);
    setBusy("checking");
    try {
      const json = await send(chosen, "preview");
      setPreview(json.preview as ImportPreview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't read that file.");
    } finally {
      setBusy("");
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function save() {
    if (!file) return;
    setBusy("saving");
    setError(null);
    try {
      const json = await send(file, "save");
      onImported({ created: json.created || 0, updated: json.updated || 0, skipped: json.skipped || [] });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't save your products. Please try again.");
    } finally {
      setBusy("");
    }
  }

  const toSave = preview ? preview.newCount + preview.updatedCount : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => busy !== "saving" && onOpenChange(o)}>
      <DialogContent className="flex max-h-[90vh] w-[calc(100%-2rem)] max-w-lg flex-col overflow-hidden">
        <DialogHeader className="text-left">
          <DialogTitle>Import products</DialogTitle>
          <DialogDescription className="text-slate-600">
            Add or update many products at once from a spreadsheet (CSV or Excel). Products are matched by SKU, then by web link, so importing an export updates the same products.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700">
            <li>
              Start from{" "}
              <a href={`/api/store/products/import/template?slug=${encodeURIComponent(slug)}`} className={`font-medium text-blue-700 underline ${focusRing} rounded`}>
                the template
              </a>
              , or from an export of your products.
            </li>
            <li>Only Name and Price are needed for a new product. Leave a cell blank to keep what&rsquo;s already saved.</li>
            <li>For sizes or colours, add a row for each with the Option column filled in (for example Size=M) and the same SKU as the product.</li>
          </ol>

          <input
            ref={inputRef}
            id={`${id}-file`}
            type="file"
            accept=".csv,.xlsx,text/csv"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              if (chosen) check(chosen);
            }}
          />
          <button type="button" className={`${dashButton.secondary} ${focusRing}`} onClick={() => inputRef.current?.click()} disabled={busy !== ""}>
            <FileUp className="h-4 w-4" aria-hidden />
            {file ? "Choose a different file" : "Choose a file"}
          </button>
          {file ? <p className="break-all text-sm text-slate-700">File: {file.name}</p> : null}

          <div aria-live="polite" className="space-y-3">
            {busy === "checking" ? <p className="text-sm text-slate-600">Checking your file…</p> : null}
            {busy === "saving" ? <p className="text-sm text-slate-600">Saving your products…</p> : null}
            {preview ? (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-sm font-semibold text-slate-900">{preview.summary}</p>
                {preview.problems.length ? (
                  <>
                    <p className="text-sm text-slate-700">Rows with problems won&rsquo;t be saved. You can fix them and import the file again.</p>
                    <ul className="max-h-48 space-y-1 overflow-y-auto text-sm text-amber-900">
                      {preview.problems.slice(0, 50).map((p, i) => (
                        <li key={`${p.row}-${i}`}>
                          Row {p.row}: {p.reason}
                        </li>
                      ))}
                    </ul>
                    {preview.problems.length > 50 ? <p className="text-xs text-slate-600">…and {preview.problems.length - 50} more.</p> : null}
                  </>
                ) : (
                  <p className="text-sm text-slate-700">Everything looks good.</p>
                )}
              </div>
            ) : null}
          </div>
          {error ? <DashAlert message={error} /> : null}
        </div>

        <DialogFooter>
          <button type="button" className={`${dashButton.secondary} ${focusRing}`} onClick={() => onOpenChange(false)} disabled={busy === "saving"}>
            Cancel
          </button>
          <button type="button" className={`${dashButton.primary} ${focusRing}`} onClick={save} disabled={!preview || toSave === 0 || busy !== ""}>
            {busy === "saving" ? "Saving…" : toSave ? `Save ${toSave} ${toSave === 1 ? "product" : "products"}` : "Save"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Export button: a download for Standard shops, a short note about the plan for everyone else. */
export function ExportButton({ slug, canExport, onUpgradeNeeded }: { slug: string; canExport: boolean; onUpgradeNeeded: () => void }) {
  if (canExport) {
    return (
      <a href={`/api/store/products/export?slug=${encodeURIComponent(slug)}`} className={`${dashButton.secondary} ${focusRing}`}>
        <Download className="h-4 w-4" aria-hidden />
        Export
        <span className="sr-only"> all products as a spreadsheet (CSV)</span>
      </a>
    );
  }
  return (
    <button type="button" className={`${dashButton.secondary} ${focusRing}`} onClick={onUpgradeNeeded}>
      <Download className="h-4 w-4" aria-hidden />
      Export
      <span className="sr-only"> all products as a spreadsheet (CSV)</span>
    </button>
  );
}
