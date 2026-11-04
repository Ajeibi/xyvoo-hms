import type { Metadata } from "next";
import { UnsubscribeForm } from "@/components/hms/guests/UnsubscribeForm";

export const metadata: Metadata = {
  title: "Stop marketing messages",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <main className="mx-auto min-h-screen w-full max-w-md px-4 py-16">
      <UnsubscribeForm token={token} />
    </main>
  );
}
