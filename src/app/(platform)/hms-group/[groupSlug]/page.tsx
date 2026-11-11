import { redirect } from "next/navigation";

export default async function GroupHome({ params }: { params: Promise<{ groupSlug: string }> }) {
  const { groupSlug } = await params;
  redirect(`/hms-group/${groupSlug}/dashboard`);
}
