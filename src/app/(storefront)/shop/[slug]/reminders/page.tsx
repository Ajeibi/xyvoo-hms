import type { Metadata } from "next";
import { notFound } from "next/navigation";
import StopRemindersForm from "@/components/storefront-theme/StopRemindersForm";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";

// A private link from a reminder email: never indexed, never cached.
export const metadata: Metadata = { title: "Basket reminders", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function StopRemindersPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ k?: string }> }) {
  const [{ slug }, { k }] = await Promise.all([params, searchParams]);
  const storefront = await getStorefront(slug);
  if (!storefront || typeof k !== "string" || !k) notFound();

  return (
    <div className="container section">
      <p className="eyebrow">Your emails</p>
      <h1 className="h-page">Basket reminders</h1>
      <StopRemindersForm reminderKey={k} storeName={storefront.storeName} shopHref={storeHref(storefront.basePath, STORE_PATHS.home)} />
    </div>
  );
}
