import Link from "next/link";
import HMSLayout from "@/components/hms/HMSLayout";
import { getHotelTenantBySlug } from "@/lib/hms/data";
import { getGuestsDirectory } from "@/lib/hms/guests-directory";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";

export default async function GuestsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tenant = await getHotelTenantBySlug(slug);
  const guests = tenant ? await getGuestsDirectory(tenant.id) : [];

  return (
    <HMSLayout slug={slug} requiredSection="guests">
      <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="text-xl font-semibold text-slate-900">Guests</h1>
        <p className="mt-0.5 text-sm text-slate-500">Guest profiles and stay history</p>
        <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {guests.length === 0 ? (
            <p className="p-10 text-center text-sm text-slate-500">No guests yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-6 py-3">Name</th>
                  <th className="px-6 py-3">Contact</th>
                  <th className="px-6 py-3">Tags</th>
                  <th className="px-6 py-3">Last stay</th>
                </tr>
              </thead>
              <tbody>
                {guests.map((g) => (
                  <tr key={g.id} className="border-t border-slate-100">
                    <td className="px-6 py-3">
                      <Link
                        href={`/hms/${slug}/guests/${g.id}`}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        {g.displayName}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-slate-600">
                      {g.phone}
                      <br />
                      {g.email}
                    </td>
                    <td className="px-6 py-3 text-slate-600">{g.tags.join(", ") || "—"}</td>
                    <td className="px-6 py-3 text-slate-600">
                      {g.lastStayAt ? formatBoardDateTime(g.lastStayAt) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </HMSLayout>
  );
}
