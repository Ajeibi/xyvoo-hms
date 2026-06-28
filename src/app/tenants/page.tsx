import Link from "next/link";
import { ArrowRight, Building2, ExternalLink, PlusCircle, Search } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { getPlatformTenants } from "@/lib/platform/tenants";

const statusConfig: Record<string, { color: string; bg: string; dot: string }> = {
  active: { color: "text-emerald-600", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  pending: { color: "text-amber-600", bg: "bg-amber-50", dot: "bg-amber-500" },
  suspended: { color: "text-red-500", bg: "bg-red-50", dot: "bg-red-500" },
  cancelled: { color: "text-slate-400", bg: "bg-slate-100", dot: "bg-slate-400" },
};

export default async function TenantsPage() {
  const tenants = await getPlatformTenants();
  return (
    <AdminLayout>
      <div className="px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Tenants</h1>
            <p className="text-sm text-slate-500 mt-0.5">{tenants.length} hotels on the platform</p>
          </div>
          <Link href="/onboard" className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all shadow-sm">
            <PlusCircle className="w-4 h-4" />
            Onboard Hotel
          </Link>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input type="text" placeholder="Search hotels, slugs, emails..." className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/40 transition-all" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          {tenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Building2 className="w-12 h-12 text-slate-200 mb-3" />
              <p className="text-slate-600 text-sm font-medium">No tenants found</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60">
                  {["Hotel", "Contact", "Plan", "Rooms", "Location", "Status", ""].map((h) => (
                    <th key={h} className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {tenants.map((t) => {
                  const sc = statusConfig[t.status] || statusConfig.pending;
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm" style={{
                          backgroundColor: t.brand_primary_color || "var(--xyvoo-blue)",
                          color: "#fff",
                        }}>
                            {t.hotel_name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-800 group-hover:text-blue-600 transition-colors">{t.hotel_name}</p>
                            <p className="text-xs text-slate-400 font-mono">{t.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="text-sm text-slate-700">{t.contact_name || "—"}</p>
                        <p className="text-xs text-slate-500">{t.contact_email}</p>
                      </td>
                      <td className="px-6 py-3.5"><span className="text-xs capitalize text-slate-600 bg-slate-100 px-2 py-1 rounded font-medium">{t.plan || "starter"}</span></td>
                      <td className="px-6 py-3.5 text-sm text-slate-500">{t.room_count || "—"}</td>
                      <td className="px-6 py-3.5 text-sm text-slate-500">{[t.city, t.country].filter(Boolean).join(", ") || "—"}</td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs capitalize px-2.5 py-1 rounded-full font-medium ${sc.bg} ${sc.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {t.status || "pending"}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-2">
                          <Link href={`/hms/${t.slug}/dashboard`} className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
                            <ExternalLink className="w-3 h-3" /> Open HMS
                          </Link>
                          <Link href={`/tenants/${t.id}`} className="text-slate-300 hover:text-blue-600 transition-colors">
                            <ArrowRight className="w-4 h-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
}
