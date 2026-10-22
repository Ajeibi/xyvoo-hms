import { Fragment, createElement, type ReactNode } from "react";
import type { ShopLanguage } from "./languages";
import type { MessageKey } from "./messages";

/*
 * Turning a message key into words. Shared by server pages (getShopT) and
 * client components (useT), which get only their language's words from the
 * layout, never every language's.
 *
 *   t("checkout.payNow")                       "Pay now"
 *   t("checkout.itemCount", { count: 3 })      "3 items" (picks itemCount_one / itemCount_other)
 *   t("checkout.thanks", { name: "Ada" })      "Thank you, Ada"
 *   t.rich("checkout.ref", { ref: <strong>AB12</strong> })   words with elements in them
 */

export type MessageVars = Record<string, string | number>;

export type Translator = {
  (key: MessageKey, vars?: MessageVars): string;
  /** For words with links or bold text in them: {name} placeholders can be elements. */
  rich: (key: MessageKey, vars: Record<string, ReactNode>) => ReactNode;
  lang: ShopLanguage;
};

const PLACEHOLDER = /\{(\w+)\}/g;

export function createTranslator(lang: ShopLanguage, words: Record<string, string>): Translator {
  const plural = new Intl.PluralRules(lang);
  const lookup = (key: string, count: unknown) => {
    if (typeof count === "number") {
      const form = words[`${key}_${plural.select(count)}`] ?? words[`${key}_other`];
      if (form !== undefined) return form;
    }
    // A missing word shows its key, so it's easy to spot (the types should stop it happening).
    return words[key] ?? key;
  };
  const number = new Intl.NumberFormat(lang);

  const t = ((key: MessageKey, vars?: MessageVars) =>
    lookup(key, vars?.count).replace(PLACEHOLDER, (whole, name: string) => {
      const value = vars?.[name];
      if (value === undefined) return whole;
      return typeof value === "number" ? number.format(value) : value;
    })) as Translator;

  t.rich = (key, vars) => {
    const parts = lookup(key, vars.count).split(PLACEHOLDER);
    // split() with a capture group: even indexes are words, odd ones are placeholder names.
    return createElement(
      Fragment,
      null,
      ...parts.map((part, i) => (i % 2 === 0 ? part : createElement(Fragment, { key: i }, vars[part] ?? `{${part}}`))),
    );
  };
  t.lang = lang;
  return t;
}
