import Link from "next/link";
import { Sparkles } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { STANDARD_CURRENCY, STANDARD_PRICE } from "@/lib/store/billing";

/**
 * Shown in place of a Standard-only feature on a Free shop: what the feature
 * does, and where to upgrade. Nothing the shop saved before is lost; it comes
 * back when they upgrade.
 */
export default function UpgradePrompt({
  slug,
  title,
  description,
  canUpgrade = true,
  headingLevel = 2,
}: {
  slug: string;
  title: string;
  description: React.ReactNode;
  /** Staff can't change the plan, so they're told who can. */
  canUpgrade?: boolean;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 via-white to-emerald-50 p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-700 ring-1 ring-blue-100">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-800">Standard plan</p>
          <Heading className="mt-0.5 text-base font-semibold text-slate-900">{title}</Heading>
          <div className="mt-1 text-sm text-slate-700">{description}</div>
          {canUpgrade ? (
            <Link
              href={`/storefront/${slug}/payments#plan-and-fees`}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-xyvoo-blue px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-xyvoo-blue"
            >
              Upgrade to Standard: {formatShopCurrency(STANDARD_PRICE, STANDARD_CURRENCY)} a month
            </Link>
          ) : (
            <p className="mt-3 text-sm text-slate-600">Ask the shop owner or an admin if you&rsquo;d like to use this.</p>
          )}
        </div>
      </div>
    </section>
  );
}
