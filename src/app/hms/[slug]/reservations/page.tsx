import Link from "next/link";
import HMSLayout from "@/components/hms/HMSLayout";

export default async function ReservationsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <HMSLayout slug={slug} requiredSection="reservations">
      <div className="px-8 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Reservations</h1>
            <p className="text-sm text-slate-500 mt-0.5">Manage upcoming and in-house stays</p>
          </div>
          <Link href={`/hms/${slug}/reservations/new`} className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            New Reservation
          </Link>
        </div>

        <div className="mt-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-10 text-center">
            <p className="text-sm text-slate-500">No reservations yet.</p>
          </div>
        </div>
      </div>
    </HMSLayout>
  );
}
