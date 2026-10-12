"use client";

import { Plus, X } from "lucide-react";
import { detectPlatform, MAX_SOCIAL_LINKS, platformLabel } from "@/lib/store/socials";

/**
 * Links to the shop's social pages. The merchant just pastes each link; we say
 * which platform it is, so there's nothing to pick first. Any website works.
 */
export default function SocialLinksField({
  idPrefix,
  links,
  onChange,
  inputClassName,
  errors = {},
  disabled = false,
}: {
  idPrefix: string;
  links: string[];
  onChange: (links: string[]) => void;
  inputClassName: string;
  /** Messages by row index. */
  errors?: Record<number, string>;
  disabled?: boolean;
}) {
  // Always show a few empty rows to paste into.
  const rows = links.length >= 3 ? links : [...links, ...Array(3 - links.length).fill("")];
  const set = (i: number, value: string) => onChange(rows.map((l, j) => (j === i ? value : l)));
  const seen = new Map<string, number>();

  return (
    <div className="space-y-3">
      {rows.map((link, i) => {
        const id = `${idPrefix}-${i}`;
        const platform = link.trim() ? detectPlatform(link.trim()) : null;
        const duplicate = platform && platform !== "other" && seen.has(platform);
        if (platform && platform !== "other" && !seen.has(platform)) seen.set(platform, i);
        const note = errors[i]
          ? errors[i]
          : duplicate
            ? `You've already added ${platformLabel(platform)}. Only the first one shows as an icon; this one is listed as another link.`
            : platform
              ? platform === "other"
                ? "Another website"
                : platformLabel(platform)
              : "";
        return (
          <div key={i}>
            <label htmlFor={id} className="sr-only">
              Social media link {i + 1}
            </label>
            <div className="flex gap-2">
              <input
                id={id}
                type="url"
                inputMode="url"
                className={inputClassName}
                value={link}
                placeholder={["https://instagram.com/yourstore", "https://tiktok.com/@yourstore", "https://facebook.com/yourstore"][i] ?? "https://"}
                onChange={(e) => set(i, e.target.value)}
                onBlur={(e) => {
                  // "instagram.com/shop" is fine: add the https:// for them.
                  const v = e.target.value.trim();
                  if (v && !/^https?:\/\//i.test(v)) set(i, `https://${v}`);
                  else if (/^http:\/\//i.test(v)) set(i, v.replace(/^http:/i, "https:"));
                }}
                aria-invalid={Boolean(errors[i]) || undefined}
                aria-describedby={note ? `${id}-note` : undefined}
                disabled={disabled}
              />
              {rows.length > 1 && (link || i >= 3) ? (
                <button
                  type="button"
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                  className="flex h-11 w-11 shrink-0 items-center justify-center self-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                  aria-label={`Remove link ${i + 1}`}
                  disabled={disabled}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              ) : null}
            </div>
            {note ? (
              <p id={`${id}-note`} className={`mt-1 text-xs ${errors[i] ? "text-red-700" : duplicate ? "text-amber-700" : "text-slate-500"}`}>
                {note}
              </p>
            ) : null}
          </div>
        );
      })}
      {rows.length < MAX_SOCIAL_LINKS ? (
        <button
          type="button"
          onClick={() => {
            onChange([...rows, ""]);
            window.setTimeout(() => document.getElementById(`${idPrefix}-${rows.length}`)?.focus(), 0);
          }}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 text-sm font-medium text-slate-700 hover:border-slate-400 hover:bg-slate-50"
          disabled={disabled}
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add another link
        </button>
      ) : null}
    </div>
  );
}
