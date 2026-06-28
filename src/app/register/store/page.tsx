import Link from "next/link";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import { XYVOO_AUTH_ROUTES } from "@/constants/auth-links";

export default function StoreRegisterPage() {
  return (
    <WebsiteLayout>
      <div className="min-h-screen bg-slate-50 px-4 pb-16 pt-28">
        <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-xyvoo-blue">
            XYVOO Store
          </p>
          <h1 className="mt-2 text-2xl font-bold text-slate-900">
            Store signup is almost here
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            Self-serve registration for XYVOO Store will live on this page. For now, reach out
            for early access or start with the hotel management product.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              href="/home/contact"
              className="inline-flex flex-1 items-center justify-center rounded-xl bg-xyvoo-blue px-5 py-3 text-center text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-95"
            >
              Request access
            </Link>
            <Link
              href={XYVOO_AUTH_ROUTES.hms.register}
              className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-800 hover:bg-slate-50"
            >
              Register for HMS
            </Link>
          </div>
        </div>
      </div>
    </WebsiteLayout>
  );
}
