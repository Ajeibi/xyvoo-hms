"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, CircleHelp, Loader2, Plus, Save, Trash2, ArrowRightLeft } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { FbConfigPayload } from "@/lib/hms/load-fb-pages";
import type {
  FbMenuCategoryRow,
  FbMenuItemRow,
  FbOutletRow,
  FbOutletType,
  FbStationRow,
} from "@/lib/hms/fb-types";
import { cn } from "@/lib/utils";

type EditableItem = {
  key: string;
  id?: string;
  outletId: string;
  categoryKey: string;
  stationId: string | null;
  name: string;
  price: string;
  description: string;
  sortOrder: number;
  isAvailable: boolean;
};

type EditableCategory = {
  key: string;
  id?: string;
  outletId: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  items: EditableItem[];
};

type DeleteTarget =
  | { type: "category"; key: string }
  | { type: "item"; categoryKey: string; itemKey: string }
  | { type: "outlet"; id: string }
  | { type: "station"; id: string };

const OUTLET_TYPE_OPTIONS: { value: FbOutletType; label: string }[] = [
  { value: "restaurant", label: "Restaurant" },
  { value: "bar", label: "Bar" },
  { value: "room_service", label: "Room service" },
];

function formatPriceForEdit(price: number) {
  if (!Number.isFinite(price) || price === 0) return "";
  return String(price);
}

function sanitizePriceInput(raw: string) {
  let value = raw.replace(/[^\d.]/g, "");
  const dot = value.indexOf(".");
  if (dot !== -1) {
    value = value.slice(0, dot + 1) + value.slice(dot + 1).replace(/\./g, "");
  }
  if (value.startsWith("0") && value.length > 1 && value[1] !== ".") {
    value = value.replace(/^0+/, "");
  }
  return value;
}

function pickDefaultOutletId(outlets: FbOutletRow[], categories: FbMenuCategoryRow[]) {
  if (outlets.length === 0) return "";

  const restaurant = outlets.find((o) => o.outlet_type === "restaurant");
  if (restaurant && categories.some((c) => c.outlet_id === restaurant.id)) {
    return restaurant.id;
  }

  let bestId = outlets[0].id;
  let bestCount = -1;
  for (const outlet of outlets) {
    const count = categories.filter((c) => c.outlet_id === outlet.id).length;
    if (count > bestCount) {
      bestCount = count;
      bestId = outlet.id;
    }
  }
  return bestId;
}

function readSavedOutletId(slug: string, outlets: FbOutletRow[]) {
  if (typeof sessionStorage === "undefined") return null;
  const saved = sessionStorage.getItem(`menu-setup-outlet:${slug}`);
  return saved && outlets.some((o) => o.id === saved) ? saved : null;
}

function resolveOutletId(
  slug: string,
  outlets: FbOutletRow[],
  categories: FbMenuCategoryRow[],
  preferredId?: string,
) {
  if (preferredId && outlets.some((o) => o.id === preferredId)) return preferredId;
  const saved = readSavedOutletId(slug, outlets);
  if (saved) return saved;
  return pickDefaultOutletId(outlets, categories);
}

function serverMenuFingerprint(initial: FbConfigPayload) {
  return [
    initial.outlets.map((o) => o.id).join(","),
    initial.stations.map((s) => s.id).join(","),
    initial.categories.map((c) => c.id).join(","),
    initial.items.map((i) => i.id).join(","),
  ].join("|");
}

function newKey(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function buildEditableCategories(
  categories: FbMenuCategoryRow[],
  items: FbMenuItemRow[],
): EditableCategory[] {
  return (categories ?? [])
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((c) => ({
      key: c.id,
      id: c.id,
      outletId: c.outlet_id,
      name: c.name,
      sortOrder: c.sort_order,
      isActive: c.is_active,
      items: (items ?? [])
        .filter((i) => i.category_id === c.id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((i) => ({
          key: i.id,
          id: i.id,
          outletId: i.outlet_id,
          categoryKey: c.id,
          stationId: i.station_id,
          name: i.name,
          price: formatPriceForEdit(i.price),
          description: i.description ?? "",
          sortOrder: i.sort_order,
          isAvailable: i.is_available,
        })),
    }));
}

export default function HotelMenuSetup({
  slug,
  currency,
  initial,
}: {
  slug: string;
  currency: string;
  initial: FbConfigPayload;
}) {
  const [outlets, setOutlets] = useState<FbOutletRow[]>(initial.outlets);
  const [stations, setStations] = useState<FbStationRow[]>(initial.stations);
  const [outletId, setOutletId] = useState(() =>
    pickDefaultOutletId(initial.outlets, initial.categories),
  );
  const [categories, setCategories] = useState<EditableCategory[]>(() =>
    buildEditableCategories(initial.categories, initial.items),
  );
  const serverFingerprint = useMemo(() => serverMenuFingerprint(initial), [initial]);
  const hydratedFingerprint = useRef<string | null>(null);
  const savedOutletApplied = useRef(false);
  const [openCategories, setOpenCategories] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [savingCategoryKey, setSavingCategoryKey] = useState<string | null>(null);
  const [transferringCategoryKey, setTransferringCategoryKey] = useState<string | null>(null);
  const [moveSelectEpoch, setMoveSelectEpoch] = useState(0);
  const [stationSaving, setStationSaving] = useState(false);
  const [outletSaving, setOutletSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showAddOutlet, setShowAddOutlet] = useState(false);
  const [showAddStation, setShowAddStation] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newOutletName, setNewOutletName] = useState("");
  const [newStationName, setNewStationName] = useState("");
  const [newOutletType, setNewOutletType] = useState<FbOutletType>("restaurant");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  useEffect(() => {
    if (savedOutletApplied.current || outlets.length === 0) return;
    savedOutletApplied.current = true;
    const saved = readSavedOutletId(slug, outlets);
    if (saved) setOutletId(saved);
  }, [slug, outlets]);

  useEffect(() => {
    if (hydratedFingerprint.current === serverFingerprint) return;
    hydratedFingerprint.current = serverFingerprint;

    setOutlets(initial.outlets);
    setStations(initial.stations);
    setCategories(buildEditableCategories(initial.categories, initial.items));
    setOutletId((prev) => {
      if (prev && initial.outlets.some((o) => o.id === prev)) return prev;
      return pickDefaultOutletId(initial.outlets, initial.categories);
    });
  }, [initial, serverFingerprint, slug]);

  const applyMetaPayload = useCallback((data: { outlets?: FbOutletRow[]; stations?: FbStationRow[] }) => {
    if (data.outlets) {
      setOutlets(data.outlets);
      setOutletId((prev) => resolveOutletId(slug, data.outlets!, [], prev || undefined));
    }
    if (data.stations) setStations(data.stations);
  }, [slug]);

  const applyContentPayload = useCallback(
    (data: { categories?: FbMenuCategoryRow[]; items?: FbMenuItemRow[] }) => {
      if (data.categories && data.items) {
        setCategories(buildEditableCategories(data.categories, data.items));
      }
    },
    [],
  );

  const applyPayload = useCallback(
    (data: {
      outlets: FbOutletRow[];
      stations: FbStationRow[];
      categories: FbMenuCategoryRow[];
      items: FbMenuItemRow[];
    }) => {
      setOutlets(data.outlets ?? []);
      setStations(data.stations ?? []);
      setCategories(buildEditableCategories(data.categories ?? [], data.items ?? []));
      setOutletId((prev) =>
        resolveOutletId(slug, data.outlets ?? [], data.categories ?? [], prev || undefined),
      );
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.removeItem(`fb-config-seeded-${slug}`);
      }
    },
    [slug],
  );

  const switchOutlet = (id: string) => {
    if (id === outletId) return;
    setOutletId(id);
    setOpenCategories([]);
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(`menu-setup-outlet:${slug}`, id);
    }
  };

  const postMenuSetup = useCallback(
    async (body: Record<string, unknown>) => {
      const res = await fetch("/api/hotel/menu-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const data = await res.json();
      if (!res.ok) {
        toastError("Request failed", data.error ?? "Try again.");
        return null;
      }
      if (data.partial === "meta") {
        applyMetaPayload(data);
      } else if (data.partial === "content") {
        applyContentPayload(data);
      } else {
        applyPayload(data);
      }
      return data;
    },
    [applyContentPayload, applyMetaPayload, applyPayload, slug],
  );

  const save = async (onlyCategoryKey?: string) => {
    setSaving(true);
    setSavingCategoryKey(onlyCategoryKey ?? null);
    const cats = onlyCategoryKey
      ? categories.filter((c) => c.key === onlyCategoryKey)
      : categories;

    const pendingCats = cats.filter((c) => !c.id);
    let latestCategories = categories;

    if (pendingCats.length > 0) {
      const res1 = await fetch("/api/hotel/menu-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          upsertCategories: pendingCats.map((c, idx) => ({
            outletId: c.outletId,
            name: c.name,
            sortOrder: c.sortOrder ?? idx,
            isActive: c.isActive,
          })),
          upsertItems: [],
          deleteCategoryIds: [],
          deleteItemIds: [],
        }),
      });
      const data1 = await res1.json();
      if (!res1.ok) {
        setSaving(false);
        setSavingCategoryKey(null);
        toastError("Save failed", data1.error ?? "Try again.");
        return;
      }

      const idByName = new Map(
        (data1.categories as FbMenuCategoryRow[])
          .filter((c) => c.outlet_id === outletId)
          .map((c) => [c.name, c.id]),
      );
      latestCategories = categories.map((c) => {
        if (c.id || !idByName.has(c.name)) return c;
        return { ...c, id: idByName.get(c.name), key: idByName.get(c.name)! };
      });
      setCategories(latestCategories);
      if (data1.partial === "content") {
        applyContentPayload(data1);
      } else {
        setOutlets(data1.outlets ?? outlets);
        setStations(data1.stations ?? stations);
      }
    }

    const payloadCats = onlyCategoryKey
      ? latestCategories.filter((c) => c.key === onlyCategoryKey)
      : latestCategories;

    const res = await fetch("/api/hotel/menu-setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug,
        upsertCategories: payloadCats.map((c, idx) => ({
          id: c.id,
          outletId: c.outletId,
          name: c.name,
          sortOrder: c.sortOrder ?? idx,
          isActive: c.isActive,
        })),
        upsertItems: payloadCats.flatMap((c) =>
          c.items.map((item, idx) => ({
            id: item.id,
            outletId: item.outletId,
            categoryId: c.id ?? null,
            stationId: item.stationId,
            name: item.name,
            price: Number(item.price) || 0,
            description: item.description || null,
            sortOrder: item.sortOrder ?? idx,
            isAvailable: item.isAvailable,
          })),
        ),
      }),
    });
    const data = await res.json();
    setSaving(false);
    setSavingCategoryKey(null);
    if (!res.ok) {
      toastError("Save failed", data.error ?? "Try again.");
      return;
    }
    if (data.partial === "content") {
      applyContentPayload(data);
    } else {
      applyPayload(data);
    }
    toastSuccess("Menu saved", onlyCategoryKey ? "Category updated." : "All changes saved.");
  };

  const addOutlet = async () => {
    if (!newOutletName.trim()) {
      toastError("Section name required", "Enter a name for this menu section.");
      return;
    }
    setOutletSaving(true);
    const name = newOutletName.trim();
    setNewOutletName("");
    setShowAddOutlet(false);
    const data = await postMenuSetup({
      upsertOutlets: [{ name, outletType: newOutletType }],
    });
    setOutletSaving(false);
    if (!data) {
      setNewOutletName(name);
      setShowAddOutlet(true);
      return;
    }
    toastSuccess("Menu section added");
    const added = (data.outlets as FbOutletRow[] | undefined)?.find((o) => o.name === name);
    if (added) setOutletId(added.id);
  };

  const addStation = async () => {
    if (!newStationName.trim()) {
      toastError("Station name required", "Enter a name for the kitchen station.");
      return;
    }
    const name = newStationName.trim();
    const sortOrder = stations.length;
    const optimisticId = newKey("station-pending");
    const optimistic: FbStationRow = {
      id: optimisticId,
      tenant_id: "",
      code: name.toLowerCase().replace(/\s+/g, "_"),
      name,
      sort_order: sortOrder,
      is_active: true,
    };

    setStationSaving(true);
    setStations((prev) => [...prev, optimistic]);
    setNewStationName("");
    setShowAddStation(false);

    const data = await postMenuSetup({
      upsertStations: [{ name, sortOrder }],
    });
    setStationSaving(false);

    if (!data) {
      setStations((prev) => prev.filter((s) => s.id !== optimisticId));
      setNewStationName(name);
      setShowAddStation(true);
      return;
    }
    toastSuccess("Kitchen station added");
  };

  const addCategory = () => {
    if (!newCategoryName.trim()) {
      toastError("Category name required", "Enter a name for the new category.");
      return;
    }
    const key = newKey("cat");
    setCategories((prev) => [
      ...prev,
      {
        key,
        outletId,
        name: newCategoryName.trim(),
        sortOrder: prev.length,
        isActive: true,
        items: [],
      },
    ]);
    setOpenCategories((prev) => [...prev, key]);
    setNewCategoryName("");
    setShowAddDialog(false);
  };

  const removeCategoryLocal = (key: string) => {
    setCategories((prev) => prev.filter((c) => c.key !== key));
    setOpenCategories((prev) => prev.filter((k) => k !== key));
  };

  const updateCategory = (key: string, patch: Partial<EditableCategory>) => {
    setCategories((prev) => prev.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  };

  const transferCategory = async (categoryKey: string, targetOutletId: string) => {
    const cat = categories.find((c) => c.key === categoryKey);
    if (!cat || cat.outletId === targetOutletId || transferringCategoryKey) return;

    const targetOutlet = outlets.find((o) => o.id === targetOutletId);
    const targetName = targetOutlet?.name?.trim() || "that section";
    const targetSortOrder = categories.filter((c) => c.outletId === targetOutletId).length;
    const snapshot = cat;

    const applyMove = () => {
      setCategories((prev) =>
        prev.map((c) =>
          c.key === categoryKey
            ? {
                ...c,
                outletId: targetOutletId,
                sortOrder: targetSortOrder,
                items: c.items.map((item) => ({ ...item, outletId: targetOutletId })),
              }
            : c,
        ),
      );
      setOpenCategories((prev) => prev.filter((k) => k !== categoryKey));
      setMoveSelectEpoch((n) => n + 1);
    };

    applyMove();

    if (!cat.id) {
      toastSuccess(`Moved to ${targetName}`, "Save all when you're ready to persist.");
      return;
    }

    setTransferringCategoryKey(categoryKey);
    const data = await postMenuSetup({
      upsertCategories: [
        {
          id: cat.id,
          outletId: targetOutletId,
          name: cat.name,
          sortOrder: targetSortOrder,
          isActive: cat.isActive,
        },
      ],
      upsertItems: cat.items.map((item, idx) => ({
        id: item.id,
        outletId: targetOutletId,
        categoryId: cat.id,
        stationId: item.stationId,
        name: item.name,
        price: Number(item.price) || 0,
        description: item.description || null,
        sortOrder: item.sortOrder ?? idx,
        isAvailable: item.isAvailable,
      })),
    });
    setTransferringCategoryKey(null);

    if (!data) {
      setCategories((prev) => prev.map((c) => (c.key === categoryKey ? snapshot : c)));
      return;
    }

    toastSuccess(
      `Moved to ${targetName}`,
      `${cat.name} and ${cat.items.length} item${cat.items.length === 1 ? "" : "s"} now live under ${targetName}.`,
    );
  };

  const addItem = (categoryKey: string) => {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.key !== categoryKey) return c;
        const key = newKey("item");
        return {
          ...c,
          items: [
            ...c.items,
            {
              key,
              outletId,
              categoryKey,
              stationId: null,
              name: "",
              price: "",
              description: "",
              sortOrder: c.items.length,
              isAvailable: true,
            },
          ],
        };
      }),
    );
  };

  const addItemToCategory = (categoryKey: string) => {
    setOpenCategories((prev) => (prev.includes(categoryKey) ? prev : [...prev, categoryKey]));
    addItem(categoryKey);
  };

  const updateItem = (categoryKey: string, itemKey: string, patch: Partial<EditableItem>) => {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.key !== categoryKey) return c;
        return {
          ...c,
          items: c.items.map((i) => (i.key === itemKey ? { ...i, ...patch } : i)),
        };
      }),
    );
  };

  const removeItemLocal = (categoryKey: string, itemKey: string) => {
    setCategories((prev) =>
      prev.map((c) => {
        if (c.key !== categoryKey) return c;
        return { ...c, items: c.items.filter((i) => i.key !== itemKey) };
      }),
    );
  };

  const confirmDelete = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true);
    let succeeded = false;
    try {
      if (deleteTarget.type === "outlet") {
        const data = await postMenuSetup({ deleteOutletIds: [deleteTarget.id] });
        if (data) {
          succeeded = true;
          toastSuccess("Menu section deleted");
          setOutletId((prev) => {
            const remaining = (data.outlets as FbOutletRow[] | undefined) ?? [];
            if (remaining.some((o) => o.id === prev)) return prev;
            return remaining[0]?.id ?? "";
          });
        }
      } else if (deleteTarget.type === "station") {
        const data = await postMenuSetup({ deleteStationIds: [deleteTarget.id] });
        if (data) {
          succeeded = true;
          toastSuccess("Kitchen station deleted");
        }
      } else if (deleteTarget.type === "category") {
        const cat = categories.find((c) => c.key === deleteTarget.key);
        if (!cat) return;
        if (cat.id) {
          const data = await postMenuSetup({ deleteCategoryIds: [cat.id] });
          if (data) {
            succeeded = true;
            toastSuccess("Category deleted");
          }
        } else {
          removeCategoryLocal(deleteTarget.key);
          succeeded = true;
          toastSuccess("Category removed");
        }
      } else {
        const cat = categories.find((c) => c.key === deleteTarget.categoryKey);
        const item = cat?.items.find((i) => i.key === deleteTarget.itemKey);
        if (!item) return;
        if (item.id) {
          const data = await postMenuSetup({ deleteItemIds: [item.id] });
          if (data) {
            succeeded = true;
            toastSuccess("Item deleted");
          }
        } else {
          removeItemLocal(deleteTarget.categoryKey, deleteTarget.itemKey);
          succeeded = true;
          toastSuccess("Item removed");
        }
      }
      if (succeeded) setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const outletCategories = useMemo(
    () => categories.filter((c) => c.outletId === outletId),
    [categories, outletId],
  );

  const deleteDialog = useMemo(() => {
    if (!deleteTarget) return null;
    if (deleteTarget.type === "outlet") {
      const outlet = outlets.find((o) => o.id === deleteTarget.id);
      const name = outlet?.name?.trim() || "this section";
      const catCount = categories.filter((c) => c.outletId === deleteTarget.id).length;
      return {
        title: `Delete "${name}"?`,
        description:
          catCount > 0
            ? `This will permanently remove the menu section and ${catCount} categor${catCount === 1 ? "y" : "ies"} with all items inside. This cannot be undone if the section has past orders.`
            : "This will permanently remove this menu section. Sections with past orders cannot be deleted.",
      };
    }
    if (deleteTarget.type === "station") {
      const station = stations.find((s) => s.id === deleteTarget.id);
      const name = station?.name?.trim() || "this station";
      return {
        title: `Delete "${name}"?`,
        description:
          "This kitchen station will be removed. Menu items assigned to it will have no station until you pick another.",
      };
    }
    if (deleteTarget.type === "category") {
      const cat = categories.find((c) => c.key === deleteTarget.key);
      const name = cat?.name?.trim() || "this category";
      const itemCount = cat?.items.length ?? 0;
      return {
        title: `Delete "${name}"?`,
        description:
          itemCount > 0
            ? `This will permanently remove the category and ${itemCount} item${itemCount === 1 ? "" : "s"} inside it.`
            : "This will permanently remove this empty category.",
      };
    }
    const cat = categories.find((c) => c.key === deleteTarget.categoryKey);
    const item = cat?.items.find((i) => i.key === deleteTarget.itemKey);
    const name = item?.name?.trim() || "this item";
    return {
      title: `Delete "${name}"?`,
      description: "This item will be permanently removed from the menu.",
    };
  }, [categories, deleteTarget, outlets, stations]);

  return (
    <TooltipProvider>
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Menu setup</h2>
          <p className="mt-1 text-sm text-slate-500">
            Configure menu sections, categories, and items. Used by POS, kitchen, and the public guest
            menu.
          </p>
        </div>
        <Link
          href={`/menu/${slug}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
        >
          Preview guest menu
          <ExternalLink className="h-4 w-4" />
        </Link>
      </div>

      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="text-sm font-semibold text-slate-800">Menu sections</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="What are menu sections?"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
              Menu sections split your F&amp;B menu by service area (e.g. Restaurant, Bar, Room
              service). Each section has its own categories and appears as a filter on the guest menu
              and in POS.
            </TooltipContent>
          </Tooltip>
        </div>

        {outlets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
            No menu sections yet. Add your first section (e.g. Restaurant or Bar) to start building
            the menu.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {outlets.map((o) => (
              <div key={o.id} className="inline-flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => switchOutlet(o.id)}
                  className={cn(
                    "rounded-xl px-4 py-2 text-sm font-medium transition-colors",
                    outletId === o.id
                      ? "bg-blue-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                >
                  {o.name}
                  <span className="ml-1.5 text-xs opacity-75">
                    ({categories.filter((c) => c.outletId === o.id).length} categories)
                  </span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-slate-400 hover:text-red-600"
                  title={`Delete ${o.name}`}
                  onClick={() => setDeleteTarget({ type: "outlet", id: o.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {showAddOutlet ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-sm font-medium text-slate-800">New menu section</p>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Name</label>
                <Input
                  value={newOutletName}
                  onChange={(e) => setNewOutletName(e.target.value)}
                  placeholder="e.g. Restaurant"
                  className="max-w-xs"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void addOutlet();
                  }}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-500">Type</label>
                <select
                  value={newOutletType}
                  onChange={(e) => setNewOutletType(e.target.value as FbOutletType)}
                  className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm"
                >
                  {OUTLET_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button type="button" disabled={outletSaving} onClick={() => void addOutlet()}>
                Add section
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowAddOutlet(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={outletSaving}
            onClick={() => setShowAddOutlet(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Add menu section
          </Button>
        )}
      </div>

      <div id="kitchen-stations" className="mt-8 scroll-mt-24 space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <h3 className="text-sm font-semibold text-slate-800">Kitchen stations</h3>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="What are kitchen stations?"
              >
                <CircleHelp className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-left leading-relaxed">
              Kitchen stations route menu items to the right prep area on the kitchen display (e.g.
              Grill, Cold, Pastry). Create your own station names here, then assign them to each
              menu item below.
            </TooltipContent>
          </Tooltip>
        </div>

        {stations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
            No kitchen stations yet. Add stations for your property — nothing is pre-configured.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {stations.map((s) => (
              <li
                key={s.id}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-100 pl-3 pr-1 py-1 text-sm text-slate-800"
              >
                {s.name}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="text-slate-400 hover:text-red-600"
                  title={`Delete ${s.name}`}
                  onClick={() => setDeleteTarget({ type: "station", id: s.id })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {showAddStation ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="mb-2 text-sm font-medium text-slate-800">New kitchen station</p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={newStationName}
                onChange={(e) => setNewStationName(e.target.value)}
                placeholder="e.g. Grill"
                className="max-w-xs"
                onKeyDown={(e) => {
                  if (e.key === "Enter") void addStation();
                }}
              />
              <Button type="button" disabled={stationSaving} onClick={() => void addStation()}>
                Add station
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowAddStation(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={stationSaving}
            onClick={() => setShowAddStation(true)}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Add kitchen station
          </Button>
        )}
      </div>

      {outlets.length > 0 ? (
      <div className="mt-6 flex flex-wrap gap-2">
        <Button type="button" disabled={saving || !outletId} onClick={() => void save()} className="gap-2">
          {saving && savingCategoryKey === null ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Saving...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              Save all
            </>
          )}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={saving || !outletId}
          onClick={() => setShowAddDialog(true)}
          className="gap-2"
        >
          <Plus className="h-4 w-4" />
          Add category
        </Button>
      </div>
      ) : null}

      {showAddDialog && outletId ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="mb-2 text-sm font-medium text-slate-800">New category</p>
          <div className="flex flex-wrap gap-2">
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Category name"
              className="max-w-xs"
              onKeyDown={(e) => {
                if (e.key === "Enter") addCategory();
              }}
            />
            <Button type="button" onClick={addCategory}>
              Create
            </Button>
            <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      {outlets.length > 0 ? (
      <div className="mt-6 space-y-4">
        {outletCategories.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
            No categories yet for this outlet. Add a category to get started.
          </p>
        ) : (
          <Accordion
            type="multiple"
            value={openCategories}
            onValueChange={(v) => setOpenCategories(Array.isArray(v) ? v : [v])}
            className="space-y-3"
          >
            {outletCategories.map((cat) => (
              <AccordionItem
                key={cat.key}
                value={cat.key}
                className="rounded-xl border border-slate-200 px-0"
              >
                <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
                  <Input
                    value={cat.name}
                    onChange={(e) => updateCategory(cat.key, { name: e.target.value })}
                    className="min-w-[140px] max-w-xs flex-1 font-semibold"
                    aria-label="Category name"
                  />
                  {outlets.length > 1 ? (
                    <Select
                      key={`move-${cat.key}-${moveSelectEpoch}`}
                      disabled={transferringCategoryKey === cat.key || saving}
                      onValueChange={(targetId) => void transferCategory(cat.key, targetId)}
                    >
                      <SelectTrigger
                        className="h-8 w-[8.75rem] shrink-0 gap-1.5 px-2 text-xs"
                        aria-label={`Move ${cat.name || "category"} to another menu section`}
                      >
                        {transferringCategoryKey === cat.key ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden />
                        ) : (
                          <ArrowRightLeft className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
                        )}
                        <SelectValue placeholder="Move to…" />
                      </SelectTrigger>
                      <SelectContent>
                        {outlets
                          .filter((o) => o.id !== cat.outletId)
                          .map((o) => (
                            <SelectItem key={o.id} value={o.id}>
                              {o.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 shrink-0"
                    onClick={() => addItemToCategory(cat.key)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add item
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={saving}
                    onClick={() => void save(cat.key)}
                    title={savingCategoryKey === cat.key ? "Saving..." : "Save category"}
                  >
                    {savingCategoryKey === cat.key ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-600" aria-hidden />
                    ) : (
                      <Save className="h-4 w-4 text-slate-600" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setDeleteTarget({ type: "category", key: cat.key })}
                    title="Delete category"
                  >
                    <Trash2 className="h-4 w-4 text-red-600" />
                  </Button>
                  <AccordionTrigger className="ml-auto w-auto flex-none shrink-0 px-2 py-1 hover:no-underline [&>svg]:ml-0">
                    <span className="sr-only">Toggle {cat.name || "category"}</span>
                  </AccordionTrigger>
                </div>
                <AccordionContent className="min-h-[min(52vh,540px)] max-h-[80vh] overflow-y-auto px-4 pb-4">
                  <div className="mb-2 grid grid-cols-[1fr_100px_1fr_120px_80px] gap-2 text-xs font-medium text-slate-500">
                    <span>Item</span>
                    <span>Price ({currency})</span>
                    <span>Description</span>
                    <span className="inline-flex items-center gap-1">
                      Station
                      {stations.length === 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="inline-flex text-amber-600">
                              <CircleHelp className="h-3 w-3" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="top" className="max-w-[200px] text-left">
                            Add kitchen stations above, then assign them here.
                          </TooltipContent>
                        </Tooltip>
                      ) : null}
                    </span>
                    <span />
                  </div>
                  <div className="space-y-2">
                    {cat.items.map((item) => (
                      <div
                        key={item.key}
                        className="grid grid-cols-[1fr_100px_1fr_120px_80px] items-center gap-2 rounded-lg bg-slate-50 p-2"
                      >
                        <Input
                          value={item.name}
                          onChange={(e) =>
                            updateItem(cat.key, item.key, { name: e.target.value })
                          }
                          placeholder="Item name"
                        />
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={item.price}
                          onChange={(e) =>
                            updateItem(cat.key, item.key, {
                              price: sanitizePriceInput(e.target.value),
                            })
                          }
                          placeholder="0"
                          aria-label="Price"
                        />
                        <Input
                          value={item.description}
                          onChange={(e) =>
                            updateItem(cat.key, item.key, { description: e.target.value })
                          }
                          placeholder="Optional"
                        />
                        <select
                          value={item.stationId ?? ""}
                          onChange={(e) =>
                            updateItem(cat.key, item.key, {
                              stationId: e.target.value || null,
                            })
                          }
                          disabled={stations.length === 0}
                          className="rounded-md border border-slate-200 px-2 py-2 text-sm disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                        >
                          <option value="">
                            {stations.length === 0 ? "No stations" : "—"}
                          </option>
                          {stations.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.name}
                            </option>
                          ))}
                        </select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setDeleteTarget({
                        type: "item",
                        categoryKey: cat.key,
                        itemKey: item.key,
                      })
                    }
                    className="text-red-600 hover:text-red-700"
                  >
                    Remove
                  </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={() => addItemToCategory(cat.key)}
                  >
                    + Add item
                  </Button>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        )}
      </div>
      ) : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteDialog?.title ?? "Delete?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialog?.description ?? "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={deleting}
              onClick={() => void confirmDelete()}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
