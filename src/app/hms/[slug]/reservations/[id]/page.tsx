import HMSLayout from "@/components/hms/HMSLayout";

export default async function ReservationDetailPage({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;

  return (
    <HMSLayout slug={slug} requiredSection="reservations">
      <div className="px-8 py-8 max-w-2xl">
        <h1 className="text-xl font-semibold text-slate-900">Reservation Detail</h1>
        <p className="text-sm text-slate-500 mt-0.5">View and update guest stay details</p>
        <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <p className="text-sm text-slate-500">Reservation record `{id}` was not found.</p>
        </div>
      </div>
    </HMSLayout>
  );
}
