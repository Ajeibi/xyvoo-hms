import { PageHeaderSkeleton, TableSkeleton } from "@/components/hms/PageSkeletons";
import { Skeleton } from "@/components/ui/skeleton";

const sk = "bg-slate-200";

export default function RequestsLoading() {
  return (
    <div className="px-8 py-8">
      <PageHeaderSkeleton />

      <Skeleton className={`mt-4 h-12 w-full rounded-2xl ${sk}`} />

      <div className="mt-6 flex gap-1">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className={`h-8 w-36 rounded-lg ${sk}`} />
        ))}
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
            <Skeleton className={`h-3 w-16 ${sk}`} />
            <Skeleton className={`mt-2 h-7 w-10 ${sk}`} />
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="space-y-2">
          <Skeleton className={`h-3 w-14 ${sk}`} />
          <Skeleton className={`h-10 w-56 rounded-lg ${sk}`} />
        </div>
        <div className="space-y-2">
          <Skeleton className={`h-3 w-14 ${sk}`} />
          <Skeleton className={`h-10 w-40 rounded-lg ${sk}`} />
        </div>
      </div>

      <TableSkeleton rows={5} cols={7} />
    </div>
  );
}
