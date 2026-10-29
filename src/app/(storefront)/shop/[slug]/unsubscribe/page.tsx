import type { Metadata } from "next";
import { notFound } from "next/navigation";
import UnsubscribeForm from "@/components/storefront-theme/UnsubscribeForm";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";
import { getShopT } from "@/lib/store/i18n/server";

// A private link from a campaign email: never indexed, never cached.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const storefront = await getStorefront((await params).slug);
  const title = storefront ? getShopT(storefront)("account.unsubscribe") : "Unsubscribe";
  return { title, robots: { index: false, follow: false } };
}
export const dynamic = "force-dynamic";

export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string; r?: string }> }) {
  const [{ slug }, { k, r }] = await Promise.all([params, searchParams]);
  const storefront = await getStorefront(slug);
  if (!storefront || typeof k !== "string" || !k) notFound();
  const t = getShopT(storefront);

  return (
    <div className="container section">
      <p className="eyebrow">{t("account.yourEmails")}</p>
      <h1 className="h-page">{t("account.unsubscribe")}</h1>
      <UnsubscribeForm unsubscribeKey={k} recipientToken={typeof r === "string" ? r : null} storeName={storefront.storeName} shopHref={storeHref(storefront.basePath, STORE_PATHS.home)} />
    </div>
  );
}
