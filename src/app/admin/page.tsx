import Link from "next/link";
import { AlertCircle, ArrowRight, Building2, CheckCircle2, Clock, PlusCircle } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { getPlatformTenants } from "@/lib/platform/tenants";

const statusConfig: Record<string, { color: string; bg: string; dot: string }> = {
  active: { color: "text-emerald-600", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  pending: { color: "text-amber-600", bg: "bg-amber-50", dot: "bg-amber-500" },
  suspended: { color: "text-red-500", bg: "bg-red-50", dot: "bg-red-500" },
  cancelled: { color: "text-slate-400", bg: "bg-slate-100", dot: "bg-slate-400" },
};

export default async function AdminPage() {
  const tenants = await getPlatformTenants();
  const stats = {
    total: tenants.length,
    active: tenants.filter((t) => t.status === "active").length,
    pending: tenants.filter((t) => t.status === "pending").length,
    suspended: tenants.filter((t) => t.status === "suspended").length,
  };

  return (
    <AdminLayout>
      <div className="px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Platform Overview</h1>
            <p className="text-sm text-slate-500 mt-0.5">Monitor all tenants and platform health</p>
          </div>
          <Link href="/onboard" className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all shadow-sm">
            <PlusCircle className="w-4 h-4" />
            Onboard Hotel
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Total Tenants", value: stats.total, icon: Building2, color: "text-blue-600", bg: "bg-blue-50" },
            { label: "Active", value: stats.active, icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50" },
            { label: "Pending", value: stats.pending, icon: Clock, color: "text-amber-600", bg: "bg-amber-50" },
            { label: "Suspended", value: stats.suspended, icon: AlertCircle, color: "text-red-500", bg: "bg-red-50" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
              <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              <p className="text-sm text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <h2 className="text-sm font-semibold text-slate-800">Recent Tenants</h2>
            <Link href="/tenants" className="text-blue-600 text-xs flex items-center gap-1 hover:gap-2 transition-all">View all <ArrowRight className="w-3 h-3" /></Link>
          </div>
          {tenants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <Building2 className="w-12 h-12 text-slate-200 mb-3" />
              <p className="text-slate-600 text-sm font-medium">No tenants yet</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60">
                  {["Hotel", "Slug", "Plan", "Rooms", "Status"].map((h) => (
                    <th key={h} className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {tenants.slice(0, 5).map((t) => {
                  const sc = statusConfig[t.status] || statusConfig.pending;
                  return (
                    <tr key={t.id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="px-6 py-3.5">
                        <Link href={`/tenants/${t.id}`} className="text-sm font-medium text-slate-800 group-hover:text-blue-600 transition-colors">{t.hotel_name}</Link>
                        <p className="text-xs text-slate-500 mt-0.5">{[t.city, t.country].filter(Boolean).join(", ")}</p>
                      </td>
                      <td className="px-6 py-3.5 text-sm text-slate-500 font-mono">{t.slug}</td>
                      <td className="px-6 py-3.5"><span className="text-xs capitalize text-slate-600 bg-slate-100 px-2 py-1 rounded font-medium">{t.plan || "—"}</span></td>
                      <td className="px-6 py-3.5 text-sm text-slate-500">{t.room_count || "—"}</td>
                      <td className="px-6 py-3.5">
                        <span className={`inline-flex items-center gap-1.5 text-xs capitalize px-2.5 py-1 rounded-full font-medium ${sc.bg} ${sc.color}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {t.status || "pending"}
                        </span>
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
