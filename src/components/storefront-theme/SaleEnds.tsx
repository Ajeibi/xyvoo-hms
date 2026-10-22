"use client";

import { useEffect, useState } from "react";
import type { Translator } from "@/lib/store/i18n/translate";
import { useT } from "./StorefrontProvider";

/** "Sale ends in 3 days", "Sale ends in 5 hours", "Sale ends in 20 minutes" in the shopper's language; null once it has ended. */
function saleEndsText(endsAt: string, now: Date, t: Translator) {
  const ms = new Date(endsAt).getTime() - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return t("chrome.saleEndsIn", { time: t("chrome.days", { count: days }) });
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return t("chrome.saleEndsIn", { time: t("chrome.hours", { count: hours }) });
  return t("chrome.saleEndsIn", { time: t("chrome.minutes", { count: Math.max(1, Math.ceil(ms / 60_000)) }) });
}

/**
 * "Sale ends in 3 days" under a sale price. Worked out in the shopper's
 * browser after the page loads (so the server and browser HTML match), and
 * refreshed each minute. Shows nothing once the sale has ended.
 */
export default function SaleEnds({ endsAt, className = "sale-ends" }: { endsAt: string; className?: string }) {
  const [text, setText] = useState<string | null>(null);
  const t = useT();

  useEffect(() => {
    const update = () => setText(saleEndsText(endsAt, new Date(), t));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [endsAt, t]);

  return text ? <span className={className}>{text}</span> : null;
}
