import type { Metadata } from "next";
import { notFound } from "next/navigation";
import AccountPage from "@/components/storefront-theme/AccountPage";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";
import { getShopT } from "@/lib/store/i18n/server";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const storefront = await getStorefront((await params).slug);
  const title = storefront ? getShopT(storefront)("account.yourAccount") : "Your account";
  return { title, robots: { index: false, follow: true } };
}

export default async function StorefrontAccountPage({ params }: { params: Promise<{ slug: string }> }) {
  const storefront = await getStorefront((await params).slug);
  if (!storefront) notFound();
  const t = getShopT(storefront);
  const privacy = storefront.pages.find((p) => p.systemKey === "privacy");

  return (
    <div className="container section">
      <h1 className="h-page">{t("account.yourAccount")}</h1>
      <AccountPage storeName={storefront.storeName} privacyHref={privacy ? storeHref(storefront.basePath, STORE_PATHS.page(privacy.slug)) : null} />
    </div>
  );
}
