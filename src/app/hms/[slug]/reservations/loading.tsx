import { PageHeaderSkeleton, TableSkeleton } from "@/components/hms/PageSkeletons";
import { Skeleton } from "@/components/ui/skeleton";

const sk = "bg-slate-200";

export default function ReservationsLoading() {
  return (
    <div className="px-8 py-8">
      <PageHeaderSkeleton withAction />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
            <Skeleton className={`h-3 w-20 ${sk}`} />
            <Skeleton className={`mt-2 h-7 w-10 ${sk}`} />
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="space-y-2">
          <Skeleton className={`h-3 w-14 ${sk}`} />
          <Skeleton className={`h-10 w-56 rounded-lg ${sk}`} />
        </div>
        <div className="space-y-2">
          <Skeleton className={`h-3 w-14 ${sk}`} />
          <Skeleton className={`h-10 w-40 rounded-lg ${sk}`} />
        </div>
      </div>

      <TableSkeleton rows={5} cols={10} />

      <div className="mt-4 flex items-center justify-between">
        <Skeleton className={`h-4 w-40 ${sk}`} />
        <div className="flex gap-2">
          <Skeleton className={`h-8 w-20 rounded-lg ${sk}`} />
          <Skeleton className={`h-8 w-24 rounded-lg ${sk}`} />
          <Skeleton className={`h-8 w-16 rounded-lg ${sk}`} />
        </div>
      </div>
    </div>
  );
}
