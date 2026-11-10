import type { Metadata } from "next";
import { KioskClient } from "@/components/hms/hr/KioskClient";
import { tenantForKiosk } from "@/lib/hms/hr/hr-time";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Staff clock",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function StaffClockPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const service = createServerSupabaseClient();
  const kiosk = await tenantForKiosk(service, token);
  if (!kiosk) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
        <h1 className="text-xl font-semibold text-slate-900">This clock screen link isn&apos;t working</h1>
        <p className="mt-2 text-slate-600">Ask a manager for the current link. They can find it in HR settings.</p>
      </main>
    );
  }
  const { data: tenant } = await service.from("tenants").select("name, display_name").eq("id", kiosk.tenantId).maybeSingle();
  const hotelName = (tenant?.display_name as string | null) || (tenant?.name as string | null) || "Staff clock";
  return (
    <main className="mx-auto min-h-screen w-full max-w-xl px-4 py-8">
      <KioskClient token={token} hotelName={hotelName} photo={kiosk.photo} />
    </main>
  );
}
