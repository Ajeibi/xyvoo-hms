"use client";

import { useEffect } from "react";
import { LANGUAGE_NAMES, SHOP_LANGUAGE_PARAM, shopLanguageCookie, type ShopLanguage } from "@/lib/store/i18n/languages";
import { useStorefront, useT } from "./StorefrontProvider";

const remember = (slug: string, lang: ShopLanguage) => {
  // A year, so the shopper sees the same language next time.
  document.cookie = `${shopLanguageCookie(slug)}=${lang}; path=/; max-age=31536000; samesite=lax`;
};

/** Lets shoppers see the shop in another language it offers. Hidden when there's only one. */
export default function LanguageSwitcher() {
  const { slug, language, languages } = useStorefront();
  const t = useT();

  // Arrived on a link in another language (?lang=fr): keep it for the rest of the visit.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get(SHOP_LANGUAGE_PARAM) === language) remember(slug, language);
  }, [slug, language]);

  if (languages.length < 2) return null;

  return (
    <div className="currency-switch language-switch">
      <label className="visually-hidden" htmlFor="language-switch">
        {t("common.chooseLanguage")}
      </label>
      <select
        id="language-switch"
        value={language}
        onChange={(e) => {
          const next = e.target.value as ShopLanguage;
          remember(slug, next);
          // The whole page is drawn again in the new language.
          const url = new URL(window.location.href);
          url.searchParams.set(SHOP_LANGUAGE_PARAM, next);
          window.location.assign(url.toString());
        }}
      >
        {languages.map((l) => (
          <option key={l} value={l} lang={l}>
            {LANGUAGE_NAMES[l]}
          </option>
        ))}
      </select>
    </div>
  );
}
