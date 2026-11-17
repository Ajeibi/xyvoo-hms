import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { getHmsAccessContext } from "@/lib/hms/access";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { listMyWork } from "@/lib/hms/my-work";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My work" };

const label = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/** What has been given to the person at the keys right now (housekeeping tasks and guest requests). */
export default async function MyWorkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [tenant, access] = await Promise.all([getHotelTenantBySlug(slug), getHmsAccessContext(slug)]);
  const items = tenant && access.userId ? await listMyWork(createServerSupabaseClient(), tenant.id, slug, access.userId) : [];

  return (
    <HMSLayout slug={slug} requiredSection="my-work">
      <HmsPage>
        <HmsPageHeader
          eyebrow={access.roleLabel}
          meaning="team"
          title="My work"
          description={`What has been given to ${access.currentUserName || "you"}. Your head of department assigns it.`}
        />
        {items.length === 0 ? (
          <HmsEmptyState icon={ClipboardCheck} meaning="team" title="Nothing assigned to you" description="When a task or guest request is given to you it shows up here." />
        ) : (
          <HmsCard title={`Open items (${items.length})`} icon={ClipboardCheck} meaning="team">
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <li key={`${item.kind}:${item.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-600">
                      {item.kind === "housekeeping" ? "Housekeeping" : "Guest request"}
                      {item.detail ? ` · ${item.detail}` : ""} · {label(item.status)}
                      {item.priority && item.priority !== "normal" ? ` · ${label(item.priority)} priority` : ""}
                      {item.dueAt ? ` · due ${new Date(item.dueAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}
                    </p>
                  </div>
                  <Link href={item.href} className="text-sm font-medium text-blue-700 underline-offset-2 hover:underline">
                    Open
                  </Link>
                </li>
              ))}
            </ul>
          </HmsCard>
        )}
      </HmsPage>
    </HMSLayout>
  );
}
