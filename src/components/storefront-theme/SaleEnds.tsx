"use client";

import { useEffect, useState } from "react";
import { saleEndsText } from "@/lib/store/sale-price";

/**
 * "Sale ends in 3 days" under a sale price. Worked out in the shopper's
 * browser after the page loads (so the server and browser HTML match), and
 * refreshed each minute. Shows nothing once the sale has ended.
 */
export default function SaleEnds({ endsAt, className = "sale-ends" }: { endsAt: string; className?: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setText(saleEndsText(endsAt, new Date()));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  return text ? <span className={className}>{text}</span> : null;
}
