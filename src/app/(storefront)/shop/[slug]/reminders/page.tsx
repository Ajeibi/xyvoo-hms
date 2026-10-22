import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StopRemindersForm from "@/components/storefront-theme/StopRemindersForm";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";
import { getShopT } from "@/lib/store/i18n/server";

// A private link from a reminder email: never indexed, never cached.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const storefront = await getStorefront((await params).slug);
  const title = storefront ? getShopT(storefront)("account.basketReminders") : "Basket reminders";
  return { title, robots: { index: false, follow: false } };
}
export const dynamic = "force-dynamic";

export default async function StopRemindersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string }> }) {
  const [{ slug }, { k }] = await Promise.all([params, searchParams]);
  const storefront = await getStorefront(slug);
  if (!storefront || typeof k !== "string" || !k) notFound();
  const t = getShopT(storefront);

  return (
    <div className="container section">
      <p className="eyebrow">{t("account.yourEmails")}</p>
      <h1 className="h-page">{t("account.basketReminders")}</h1>
      <StopRemindersForm reminderKey={k} storeName={storefront.storeName} shopHref={storeHref(storefront.basePath, STORE_PATHS.home)} />
    </div>
  );
}
