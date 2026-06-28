import HMSLayout from "@/components/hms/HMSLayout";

export default async function NewReservationPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <HMSLayout slug={slug} requiredSection="reservations">
      <div className="px-8 py-8 max-w-2xl">
        <h1 className="text-xl font-semibold text-slate-900">New Reservation</h1>
        <p className="text-sm text-slate-500 mt-0.5">Capture booking details and assign room</p>
        <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
          <input placeholder="Guest name" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm" />
          <input placeholder="Email" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm" />
          <div className="grid grid-cols-2 gap-4">
            <input type="date" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm" />
            <input type="date" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm" />
          </div>
          <input placeholder="Room number" className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm" />
          <button className="px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 cursor-pointer">Create Reservation</button>
        </div>
      </div>
    </HMSLayout>
  );
}
