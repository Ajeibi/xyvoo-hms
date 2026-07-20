import { Skeleton } from "@/components/ui/skeleton";

const sk = "bg-slate-200";

export default function GuestsLoading() {
  return (
    <div className="w-full px-4 py-8 sm:px-6 lg:px-8">
      <Skeleton className={`h-6 w-24 ${sk}`} />
      <Skeleton className={`mt-2 h-4 w-56 ${sk}`} />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
            <Skeleton className={`h-3 w-24 ${sk}`} />
            <Skeleton className={`mt-2 h-7 w-12 ${sk}`} />
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <Skeleton className={`h-3 w-14 ${sk}`} />
          <Skeleton className={`mt-1.5 h-10 w-64 rounded-md ${sk}`} />
        </div>
        <Skeleton className={`mb-0.5 h-5 w-20 ${sk}`} />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-10 border-b border-slate-100 px-6 py-3">
          {["Name", "Contact", "Tags", "Visits", "Open requests", "Last stay"].map((label) => (
            <Skeleton key={label} className={`h-3 w-16 ${sk}`} />
          ))}
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-10 px-6 py-4">
              <Skeleton className={`h-4 w-32 ${sk}`} />
              <div className="space-y-1.5">
                <Skeleton className={`h-3.5 w-28 ${sk}`} />
                <Skeleton className={`h-3.5 w-36 ${sk}`} />
              </div>
              <Skeleton className={`h-4 w-16 ${sk}`} />
              <Skeleton className={`h-4 w-8 ${sk}`} />
              <Skeleton className={`h-6 w-16 rounded-full ${sk}`} />
              <Skeleton className={`h-4 w-24 ${sk}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
