/**
 * Rules for choices on menu items (modifiers). Pure functions, shared by the
 * POS (to guide staff) and the server (which decides the price).
 */

import { roundMoney } from "@/lib/hms/fb-payment-rules";

export const FB_ITEM_NOTE_MAX = 200;

export type FbModifierOptionDef = {
  id: string;
  name: string;
  price_delta: number;
  is_active: boolean;
};

export type FbModifierGroupDef = {
  id: string;
  name: string;
  min_select: number;
  max_select: number | null;
  is_active: boolean;
  options: FbModifierOptionDef[];
};

export type FbChosenModifier = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  priceDelta: number;
};

export type ModifierSelectionResult =
  | { ok: true; chosen: FbChosenModifier[]; priceDelta: number }
  | { ok: false; error: string };

/** The groups a menu item asks for, in the item's own order. */
export function groupsForMenuItem<G extends FbModifierGroupDef>(
  menuItemId: string,
  setup: { groups: G[]; links: { menu_item_id: string; group_id: string; sort_order: number }[] },
): G[] {
  const byId = new Map(setup.groups.map((g) => [g.id, g]));
  return setup.links
    .filter((l) => l.menu_item_id === menuItemId)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((l) => byId.get(l.group_id))
    .filter((g): g is G => Boolean(g));
}

/** True when the POS should ask for choices before adding the item. */
export function needsChoices(groups: FbModifierGroupDef[]) {
  return groups.some((g) => g.is_active && g.options.some((o) => o.is_active));
}

/** How a group reads to staff: "Choose 1", "Choose up to 3", "Choose 1 to 2", "Optional". */
export function describeModifierRule(group: Pick<FbModifierGroupDef, "min_select" | "max_select">) {
  const { min_select: min, max_select: max } = group;
  if (min > 0 && max === min) return `Choose ${min}`;
  if (min > 0 && max != null) return `Choose ${min} to ${max}`;
  if (min > 0) return `Choose at least ${min}`;
  if (max != null) return max === 1 ? "Optional, choose 1" : `Optional, up to ${max}`;
  return "Optional";
}

/** True when the group behaves like radio buttons (pick exactly one, or none). */
export function isSingleChoice(group: Pick<FbModifierGroupDef, "max_select">) {
  return group.max_select === 1;
}

/**
 * Checks the choices made for one menu item against its groups and works out
 * the extra price. Only active groups and options count; choices are returned
 * in the groups' and options' own order so tickets always read the same way.
 */
export function resolveModifierSelection(
  groups: FbModifierGroupDef[],
  selectedOptionIds: string[],
  basePrice: number,
): ModifierSelectionResult {
  const selected = new Set(selectedOptionIds);
  if (selected.size !== selectedOptionIds.length) {
    return { ok: false, error: "The same choice was picked twice." };
  }

  const activeGroups = groups.filter((g) => g.is_active);
  const chosen: FbChosenModifier[] = [];
  const matched = new Set<string>();

  for (const group of activeGroups) {
    const picks = group.options.filter((o) => o.is_active && selected.has(o.id));
    for (const o of picks) matched.add(o.id);

    if (picks.length < group.min_select) {
      return {
        ok: false,
        error:
          group.min_select === 1
            ? `Choose an option for ${group.name}.`
            : `Choose at least ${group.min_select} for ${group.name}.`,
      };
    }
    if (group.max_select != null && picks.length > group.max_select) {
      return {
        ok: false,
        error:
          group.max_select === 1
            ? `Choose only one option for ${group.name}.`
            : `Choose no more than ${group.max_select} for ${group.name}.`,
      };
    }
    for (const o of picks) {
      chosen.push({
        groupId: group.id,
        groupName: group.name,
        optionId: o.id,
        optionName: o.name,
        priceDelta: roundMoney(o.price_delta),
      });
    }
  }

  if (matched.size !== selected.size) {
    return { ok: false, error: "One of the choices is no longer on the menu. Pick again." };
  }

  const priceDelta = roundMoney(chosen.reduce((sum, c) => sum + c.priceDelta, 0));
  if (roundMoney(basePrice + priceDelta) < 0) {
    return { ok: false, error: "These choices would make the item cost less than nothing." };
  }
  return { ok: true, chosen, priceDelta };
}

/** Trims a kitchen note; empty means none. */
export function normaliseItemNote(note: string | null | undefined) {
  const trimmed = (note ?? "").replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, FB_ITEM_NOTE_MAX) : null;
}

/** One draft line per item + choices + note, so "Steak, rare" and "Steak, well done" stay apart. */
export function draftLineKey(menuItemId: string, optionIds: string[], note: string | null) {
  return [menuItemId, [...optionIds].sort().join(","), note ?? ""].join("|");
}

/** "Well done", "Cheese (+₦500)" style label for a chosen option. */
export function modifierLabel(
  option: { name: string; price_delta: number },
  formatMoney: (amount: number) => string,
) {
  const delta = roundMoney(option.price_delta);
  if (delta === 0) return option.name;
  return `${option.name} (${delta > 0 ? "+" : "−"}${formatMoney(Math.abs(delta))})`;
}
