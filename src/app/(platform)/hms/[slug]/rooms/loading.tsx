import { PageHeaderSkeleton, StatTilesSkeleton } from "@/components/hms/PageSkeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function RoomsLoading() {
  return (
    <div className="px-8 py-8">
      <PageHeaderSkeleton />

      <div className="mt-4 flex flex-wrap gap-2">
        <Skeleton className="h-10 w-64 rounded-lg bg-slate-200" />
        <Skeleton className="h-10 w-32 rounded-lg bg-slate-200" />
        <Skeleton className="h-10 w-32 rounded-lg bg-slate-200" />
        <Skeleton className="h-10 w-32 rounded-lg bg-slate-200" />
      </div>

      <StatTilesSkeleton count={4} />

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
            <Skeleton className="h-4 w-20 bg-slate-200" />
            <div className="mt-3 grid grid-cols-3 gap-2">
              {Array.from({ length: 6 }).map((_, j) => (
                <Skeleton key={j} className="h-14 rounded-lg bg-slate-200" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
