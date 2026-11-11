import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { GroupShell } from "@/components/hms/groups/GroupShell";
import { getGroupAccess, listUserPlaces } from "@/lib/hms/groups/group-access";
import { getSessionUser } from "@/lib/supabase/auth-server";

export async function generateMetadata({ params }: { params: Promise<{ groupSlug: string }> }): Promise<Metadata> {
  const { groupSlug } = await params;
  const access = await getGroupAccess(groupSlug);
  const name = access.ok ? access.ctx.group.name : "Hotel group";
  return { title: { default: `${name} · Hotel group | XYVOO HMS`, template: `%s · ${name} | XYVOO HMS` } };
}

/** Every /hms-group/[groupSlug]/* page: only people with a role in the group get in. */
export default async function GroupLayout({ children, params }: { children: React.ReactNode; params: Promise<{ groupSlug: string }> }) {
  const { groupSlug } = await params;
  const access = await getGroupAccess(groupSlug);
  if (!access.ok) {
    if (access.reason === "signed_out") redirect(`/auth/login?from=${encodeURIComponent(`/hms-group/${groupSlug}/dashboard`)}`);
    if (access.reason === "not_found") notFound();
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="font-heading text-2xl font-bold text-slate-900">You don&apos;t have a role in this group</h1>
        <p className="mt-2 text-slate-600">Ask the group owner to add you under the group&apos;s Settings, People.</p>
        <Link href="/hms-group" className="mt-6 inline-block text-sm font-medium text-blue-700 underline">
          See the hotels and groups you can use
        </Link>
      </main>
    );
  }
  const user = await getSessionUser();
  const places = await listUserPlaces(access.ctx.userId);
  const fullName = typeof user?.user_metadata?.full_name === "string" ? (user.user_metadata.full_name as string).trim() : "";
  return (
    <GroupShell
      groupSlug={access.ctx.group.slug}
      groupName={access.ctx.group.name}
      hotelCount={access.ctx.hotels.length}
      role={access.ctx.role}
      places={places}
      userName={fullName || access.ctx.userEmail || "You"}
    >
      {children}
    </GroupShell>
  );
}
