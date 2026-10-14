import { Skeleton } from "@/components/ui/skeleton";
import { HmsPage } from "@/components/hms/hms-ui";

const sk = "bg-slate-200";

function CardSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
        <Skeleton className={`h-10 w-10 rounded-xl ${sk}`} />
        <div className="space-y-2">
          <Skeleton className={`h-4 w-32 ${sk}`} />
          <Skeleton className={`h-3 w-48 ${sk}`} />
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex justify-between gap-6 px-5 py-3.5">
            <Skeleton className={`h-4 w-40 ${sk}`} />
            <Skeleton className={`h-4 w-16 ${sk}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function InventoryLoading() {
  return (
    <HmsPage>
      <div role="status" aria-label="Loading inventory" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className={`h-3 w-24 ${sk}`} />
            <Skeleton className={`h-7 w-44 ${sk}`} />
            <Skeleton className={`h-4 w-80 max-w-full ${sk}`} />
          </div>
          <Skeleton className={`h-10 w-36 rounded-xl ${sk}`} />
        </div>

        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className={`h-9 w-24 rounded-full ${sk}`} />
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
              <Skeleton className={`h-10 w-10 rounded-xl ${sk}`} />
              <Skeleton className={`mt-4 h-3 w-24 ${sk}`} />
              <Skeleton className={`mt-2 h-7 w-16 ${sk}`} />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    </HmsPage>
  );
}
