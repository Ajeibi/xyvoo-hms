import Link from "next/link";
import { ArrowRight, Globe } from "lucide-react";
import { HmsCard, hmsButton } from "@/components/hms/hms-ui";

/** Shown to owners and admins while the hotel's website isn't published. */
export default function HMSWebsiteCard({ slug }: { slug: string }) {
  return (
    <HmsCard title="Your website isn't live yet" icon={Globe} meaning="neutral">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-2xl text-sm text-slate-600">
          Pick a template, choose your address and publish. Guests can then ask to book online, and every request reaches your reservations email and is kept for the front desk.
        </p>
        <Link href={`/hms/${slug}/settings#website-setup-section`} className={hmsButton.primary}>
          Set up your website
          <ArrowRight className="ml-1 inline h-4 w-4" aria-hidden />
        </Link>
      </div>
    </HmsCard>
  );
}
