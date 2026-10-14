import type { Metadata } from "next";
import { notFound } from "next/navigation";
import UnsubscribeForm from "@/components/storefront-theme/UnsubscribeForm";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";

// A private link from a campaign email: never indexed, never cached.
export const metadata: Metadata = { title: "Unsubscribe", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string; r?: string }> }) {
  const [{ slug }, { k, r }] = await Promise.all([params, searchParams]);
  const storefront = await getStorefront(slug);
  if (!storefront || typeof k !== "string" || !k) notFound();

  return (
    <div className="container section">
      <p className="eyebrow">Your emails</p>
      <h1 className="h-page">Unsubscribe</h1>
      <UnsubscribeForm unsubscribeKey={k} recipientToken={typeof r === "string" ? r : null} storeName={storefront.storeName} shopHref={storeHref(storefront.basePath, STORE_PATHS.home)} />
    </div>
  );
}
