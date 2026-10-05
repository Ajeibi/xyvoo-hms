import Link from "next/link";
import { ArrowLeft, Building2, ExternalLink, Save } from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import { getPlatformTenantById } from "@/lib/platform/tenants";

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tenant = await getPlatformTenantById(id);

  if (!tenant) {
    return (
      <AdminLayout>
        <div className="flex flex-col items-center justify-center h-full">
          <Building2 className="w-12 h-12 text-slate-200 mb-3" />
          <p className="text-slate-600 font-medium">Tenant not found</p>
          <Link href="/tenants" className="text-blue-600 text-sm mt-2 hover:underline">← Back to tenants</Link>
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="px-8 py-8 max-w-3xl mx-auto">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/tenants" className="text-slate-400 hover:text-slate-700 transition-colors"><ArrowLeft className="w-5 h-5" /></Link>
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm" style={{
              backgroundColor: tenant.brand_primary_color || "var(--xyvoo-blue)",
              color: "#fff",
            }}>
              {tenant.hotel_name?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{tenant.hotel_name}</h1>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{tenant.slug}.xyvoo.app</p>
            </div>
          </div>
          <Link href={`/hms/${tenant.slug}/dashboard`} className="flex items-center gap-1.5 px-3 py-2 text-xs text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-all">
            <ExternalLink className="w-3.5 h-3.5" /> View HMS
          </Link>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Hotel Name</label>
            <input defaultValue={tenant.hotel_name} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800" readOnly />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Contact Name</label>
              <input defaultValue={tenant.contact_name || ""} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800" readOnly />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Contact Email</label>
              <input defaultValue={tenant.contact_email || ""} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800" readOnly />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">City</label>
              <input defaultValue={tenant.city || ""} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800" readOnly />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1.5">Country</label>
              <input defaultValue={tenant.country || ""} className="w-full px-3 py-2.5 bg-white border border-slate-200 rounded-lg text-sm text-slate-800" readOnly />
            </div>
          </div>
        </div>

        <div className="flex justify-end mt-5">
          <span className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 text-slate-500 text-sm font-medium rounded-lg">
            <Save className="w-4 h-4" /> Read-only view
          </span>
        </div>
      </div>
    </AdminLayout>
  );
}
