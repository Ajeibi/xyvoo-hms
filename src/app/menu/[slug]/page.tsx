import { GuestMenuClient } from "@/components/menu/GuestMenuClient";
import { loadPublicMenuPageModel } from "@/lib/hms/load-fb-pages";

export default async function PublicMenuPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const initial = await loadPublicMenuPageModel(slug);

  return <GuestMenuClient slug={slug} initial={initial} />;
}
