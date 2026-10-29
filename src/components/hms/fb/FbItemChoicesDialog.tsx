"use client";

import { useState } from "react";
import {
  describeModifierRule,
  FB_ITEM_NOTE_MAX,
  type FbModifierGroupDef,
  isSingleChoice,
  modifierLabel,
  resolveModifierSelection,
} from "@/lib/hms/fb-modifier-rules";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HmsAlert, hmsButton, hmsInput } from "@/components/hms/hms-ui";

export type FbItemChoices = { optionIds: string[]; note: string };

/**
 * Asks for an item's choices (doneness, sides, extras) and a kitchen note
 * before it goes on the ticket. Also used to change a line already on it.
 */
export function FbItemChoicesDialog({
  open,
  itemName,
  basePrice,
  currency,
  groups,
  initial,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  itemName: string;
  basePrice: number;
  currency: string;
  groups: FbModifierGroupDef[];
  initial?: FbItemChoices;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (choices: FbItemChoices) => void;
}) {
  // The parent remounts this dialog (via key) for each item, so initial state is enough.
  const [picked, setPicked] = useState<Set<string>>(() => new Set(initial?.optionIds ?? []));
  const [note, setNote] = useState(initial?.note ?? "");
  const [showErrors, setShowErrors] = useState(false);

  const money = (n: number) => formatPricingAmount(n, currency);
  const activeGroups = groups
    .filter((g) => g.is_active)
    .map((g) => ({ ...g, options: g.options.filter((o) => o.is_active) }))
    .filter((g) => g.options.length > 0);

  const optionIds = [...picked];
  const check = resolveModifierSelection(activeGroups, optionIds, basePrice);
  const unitPrice = basePrice + (check.ok ? check.priceDelta : 0);

  const toggle = (group: FbModifierGroupDef, optionId: string, on: boolean) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (isSingleChoice(group)) {
        for (const o of group.options) next.delete(o.id);
      }
      if (on) next.add(optionId);
      else next.delete(optionId);
      return next;
    });
  };

  const confirm = () => {
    if (!check.ok) {
      setShowErrors(true);
      return;
    }
    // Keep the menu's order, not the order they were tapped.
    onConfirm({ optionIds: check.chosen.map((c) => c.optionId), note: note.trim() });
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onCancel() : undefined)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{itemName}</DialogTitle>
          <DialogDescription>
            {activeGroups.length ? "Choose how it should be made." : "Add a note for the kitchen."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {activeGroups.map((group) => {
            const single = isSingleChoice(group);
            const count = group.options.filter((o) => picked.has(o.id)).length;
            const short = showErrors && count < group.min_select;
            return (
              <fieldset key={group.id}>
                <legend className="mb-2 flex w-full flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-slate-900">{group.name}</span>
                  <span className={cn("text-xs", short ? "font-semibold text-red-700" : "text-slate-600")}>
                    {describeModifierRule(group)}
                  </span>
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {group.options.map((o) => {
                    const on = picked.has(o.id);
                    return (
                      <label
                        key={o.id}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-blue-500",
                          on ? "border-orange-500 bg-orange-50 text-orange-950" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50",
                        )}
                      >
                        <input
                          type={single ? "radio" : "checkbox"}
                          name={`choice-${group.id}`}
                          checked={on}
                          onChange={(e) => toggle(group, o.id, e.target.checked)}
                          onClick={() => {
                            // Let a second tap clear an optional single choice.
                            if (single && on && group.min_select === 0) toggle(group, o.id, false);
                          }}
                          className="h-4 w-4 accent-orange-600"
                        />
                        <span className="min-w-0 flex-1">{modifierLabel(o, money)}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          <div>
            <label htmlFor="fb-item-note" className="mb-1 block text-sm font-medium text-slate-800">
              Note for the kitchen <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              id="fb-item-note"
              value={note}
              maxLength={FB_ITEM_NOTE_MAX}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. No onions, nut allergy"
              className={cn(hmsInput, "min-h-16 resize-y")}
            />
          </div>

          <HmsAlert message={showErrors && !check.ok ? check.error : ""} />
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <button type="button" onClick={onCancel} className={hmsButton.secondary}>
            Cancel
          </button>
          <button type="button" onClick={confirm} className={hmsButton.primary}>
            {confirmLabel} · {money(unitPrice)}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
