"use client";

import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CreateInventoryItemDialog } from "@/components/hms/inventory/CreateInventoryItemDialog";
import type { InventoryItemRow } from "@/lib/hms/inventory-types";
import { cn } from "@/lib/utils";

/**
 * Searchable item picker — replaces a plain `<Select>` once the catalog gets
 * too long to scan (Receiving, Requisitions, Transfers, Waste, Stock levels).
 * Optionally offers a "Create new item" shortcut so the catalog can grow
 * without leaving the current flow.
 */
export function InventoryItemPicker({
  slug,
  items,
  value,
  onValueChange,
  onItemCreated,
  canCreateItem = false,
  placeholder = "Select item",
  className,
}: {
  slug: string;
  items: InventoryItemRow[];
  value: string;
  onValueChange: (itemId: string) => void;
  onItemCreated?: (item: InventoryItemRow) => void;
  canCreateItem?: boolean;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const selected = items.find((i) => i.id === value);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((i) => i.name.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term));
  }, [items, search]);

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between font-normal", !selected && "text-slate-500", className)}
          >
            <span className="min-w-0 truncate">{selected ? `${selected.name} (${selected.sku})` : placeholder}</span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[22rem] p-0" align="start">
          <div className="border-b border-slate-100 p-2">
            <Input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or SKU"
              className="h-9"
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-slate-500">No items match.</p>
            ) : (
              filtered.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onValueChange(item.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50",
                    item.id === value && "bg-blue-50",
                  )}
                >
                  <span className="min-w-0 truncate">
                    {item.name} <span className="text-slate-400">({item.sku})</span>
                  </span>
                  {item.id === value ? <Check className="h-4 w-4 shrink-0 text-blue-600" /> : null}
                </button>
              ))
            )}
          </div>
          {canCreateItem ? (
            <div className="border-t border-slate-100 p-1">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCreateOpen(true);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-blue-700 hover:bg-blue-50"
              >
                <Plus className="h-4 w-4" />
                Create new item
              </button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>

      {canCreateItem ? (
        <CreateInventoryItemDialog
          slug={slug}
          open={createOpen}
          onOpenChange={setCreateOpen}
          onCreated={(item) => {
            onValueChange(item.id);
            onItemCreated?.(item);
          }}
        />
      ) : null}
    </>
  );
}
