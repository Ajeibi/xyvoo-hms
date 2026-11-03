import type { Metadata } from "next";
import { StayFeedbackForm } from "@/components/hms/feedback/StayFeedbackForm";

export const metadata: Metadata = {
  title: "How was your stay?",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function StayFeedbackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mx-auto min-h-screen w-full max-w-xl px-4 py-10">
      <StayFeedbackForm token={token} />
    </main>
  );
}
