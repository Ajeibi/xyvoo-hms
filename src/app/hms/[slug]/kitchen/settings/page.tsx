import { redirect } from "next/navigation";

export default async function KitchenSettingsRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/hms/${slug}/kitchen`);
}
