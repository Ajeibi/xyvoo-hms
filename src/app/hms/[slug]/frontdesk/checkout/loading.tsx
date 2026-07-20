import { Skeleton } from "@/components/ui/skeleton";

const sk = "bg-slate-200";

export default function FrontDeskCheckoutLoading() {
  return (
    <div className="w-full px-6 py-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className={`h-3 w-20 ${sk}`} />
          <Skeleton className={`h-7 w-32 ${sk}`} />
          <Skeleton className={`h-4 w-80 ${sk}`} />
        </div>
        <div className="flex gap-2">
          <Skeleton className={`h-9 w-24 rounded-md ${sk}`} />
          <Skeleton className={`h-9 w-36 rounded-md ${sk}`} />
        </div>
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-10 border-b border-slate-100 px-6 py-3">
          {["Guest", "Room", "Departure", "Balance", "Status"].map((label) => (
            <Skeleton key={label} className={`h-3 w-16 ${sk}`} />
          ))}
        </div>
        <div className="divide-y divide-slate-100">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-10 px-6 py-4">
              <div className="space-y-1.5">
                <Skeleton className={`h-4 w-32 ${sk}`} />
                <Skeleton className={`h-3 w-24 ${sk}`} />
              </div>
              <Skeleton className={`h-6 w-16 rounded-full ${sk}`} />
              <Skeleton className={`h-3.5 w-24 ${sk}`} />
              <Skeleton className={`ml-auto h-4 w-20 ${sk}`} />
              <Skeleton className={`h-6 w-20 rounded-full ${sk}`} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
