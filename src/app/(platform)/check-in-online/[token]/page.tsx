import type { Metadata } from "next";
import { OnlineCheckInForm } from "@/components/hms/onlinecheckin/OnlineCheckInForm";

export const metadata: Metadata = {
  title: "Check in online",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function OnlineCheckInPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mx-auto min-h-screen w-full max-w-xl px-4 py-10">
      <OnlineCheckInForm token={token} />
    </main>
  );
}
