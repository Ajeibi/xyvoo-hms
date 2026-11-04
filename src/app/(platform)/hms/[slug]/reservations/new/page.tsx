import Link from "next/link";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";
import HMSLayout from "@/components/hms/HMSLayout";
import { HmsPage, HmsPageHeader } from "@/components/hms/hms-ui";
import { NewReservationClient } from "@/components/hms/reservations/NewReservationClient";

export const metadata: Metadata = { title: "New reservation" };

type Search = { arrival?: string | string[]; departure?: string | string[]; type?: string | string[]; room?: string | string[] };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const day = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export default async function NewReservationPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Search> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <HMSLayout slug={slug} requiredSection="reservations">
      <HmsPage wide>
        <Link
          href={`/hms/${slug}/reservations`}
          className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to reservations
        </Link>
        <HmsPageHeader
          eyebrow="Reservations"
          meaning="rooms"
          title="New reservation"
          description="Book a future stay. The room is only marked as taken, and the bill only started, when the guest checks in."
        />
        <NewReservationClient
          slug={slug}
          today={today}
          initial={{ arrival: day(one(sp.arrival)), departure: day(one(sp.departure)), roomTypeCode: one(sp.type), roomUnitId: one(sp.room) }}
        />
      </HmsPage>
    </HMSLayout>
  );
}
