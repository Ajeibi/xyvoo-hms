import { redirect } from "next/navigation";

/** Store setup moved to the central Settings hub, alongside every other department's setup. */
export default async function InventoryLocationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/hms/${slug}/settings#inventory-setup`);
}
