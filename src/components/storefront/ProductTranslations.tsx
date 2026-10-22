"use client";

import { useEffect, useState } from "react";
import { LANGUAGE_NAMES_IN_ENGLISH, shopLanguages, type ShopLanguage } from "@/lib/store/i18n/languages";
import { DashAlert, DashField, dashInput } from "./dashboard-blocks";

type Words = { name: string; short_description: string; description: string };
type Row = Words & { id?: string; locale: string };

const EMPTY: Words = { name: "", short_description: "", description: "" };

/**
 * A product's name and descriptions in the shop's other languages. Shoppers who
 * choose one of those languages see these words; anything left empty shows as
 * written on the product. Saved straight away, separately from the product.
 */
export default function ProductTranslations({ slug, productId }: { slug: string; productId: string }) {
  const [others, setOthers] = useState<ShopLanguage[] | null>(null);
  const [words, setWords] = useState<Partial<Record<ShopLanguage, Row>>>({});
  const [saving, setSaving] = useState<ShopLanguage | null>(null);
  const [status, setStatus] = useState("");
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let cancelled = false;
    const q = `slug=${encodeURIComponent(slug)}`;
    Promise.all([
      fetch(`/api/store/site?${q}`).then((r) => (r.ok ? r.json() : null)),
      fetch(`/api/store/products/${productId}/translations?${q}`).then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([site, saved]) => {
        if (cancelled) return;
        const content = site?.resolved?.content ?? {};
        setOthers(shopLanguages(content.language, content.languages).slice(1));
        const byLang: Partial<Record<ShopLanguage, Row>> = {};
        for (const t of (saved?.translations ?? []) as Array<Row & { short_description: string | null; description: string | null; name: string | null }>) {
          byLang[t.locale as ShopLanguage] = { id: t.id, locale: t.locale, name: t.name ?? "", short_description: t.short_description ?? "", description: t.description ?? "" };
        }
        setWords(byLang);
      })
      .catch(() => !cancelled && setProblem("We couldn't load this product's translations. Please refresh the page."));
    return () => {
      cancelled = true;
    };
  }, [slug, productId]);

  if (others === null) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!others.length) {
    return (
      <p className="text-sm text-slate-600">
        Your shop is in one language. To show products in others too, add them under <strong>Website, Words, Languages</strong>.
      </p>
    );
  }

  const set = (lang: ShopLanguage, patch: Partial<Row>) => setWords((w) => ({ ...w, [lang]: { ...EMPTY, locale: lang, ...w[lang], ...patch } }));

  const save = async (lang: ShopLanguage) => {
    const row = words[lang] ?? { ...EMPTY, locale: lang };
    setSaving(lang);
    setStatus("");
    setProblem("");
    try {
      const res = await fetch(`/api/store/products/${productId}/translations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, locale: lang, name: row.name, short_description: row.short_description, description: row.description }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.error === "string" ? data.error : "We couldn't save that. Please try again.");
      set(lang, { id: data.translation?.id });
      setStatus(`${LANGUAGE_NAMES_IN_ENGLISH[lang]} saved. Shoppers reading in ${LANGUAGE_NAMES_IN_ENGLISH[lang]} see it now.`);
    } catch (err) {
      setProblem(err instanceof TypeError ? "We couldn't connect. Check your internet connection and try again." : (err as Error).message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">Shoppers who choose another language see these words. Anything you leave empty shows as you wrote it on the product.</p>
      <DashAlert message={problem} />
      {others.map((lang) => {
        const row = words[lang] ?? { ...EMPTY, locale: lang };
        const id = `tr-${lang}`;
        return (
          <fieldset key={lang} className="space-y-3 rounded-xl border border-slate-200 p-3" lang={lang}>
            <legend className="px-1 text-sm font-semibold text-slate-900">{LANGUAGE_NAMES_IN_ENGLISH[lang]}</legend>
            <DashField id={`${id}-name`} label="Product name" optional>
              <input id={`${id}-name`} className={dashInput} maxLength={200} value={row.name} onChange={(e) => set(lang, { name: e.target.value })} />
            </DashField>
            <DashField id={`${id}-short`} label="Short summary" optional>
              <input id={`${id}-short`} className={dashInput} maxLength={300} value={row.short_description} onChange={(e) => set(lang, { short_description: e.target.value })} />
            </DashField>
            <DashField id={`${id}-desc`} label="Description" optional>
              <textarea id={`${id}-desc`} rows={5} className={dashInput} maxLength={10_000} value={row.description} onChange={(e) => set(lang, { description: e.target.value })} />
            </DashField>
            <button type="button" onClick={() => save(lang)} disabled={saving !== null} className="rounded-xl bg-xyvoo-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving === lang ? "Saving…" : `Save ${LANGUAGE_NAMES_IN_ENGLISH[lang]}`}
            </button>
          </fieldset>
        );
      })}
      <p className="text-sm text-slate-700" role="status">
        {status}
      </p>
    </div>
  );
}
