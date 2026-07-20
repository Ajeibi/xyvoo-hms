import { PageHeaderSkeleton, StatTilesSkeleton } from "@/components/hms/PageSkeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function FrontDeskLoading() {
  return (
    <div className="px-8 py-8">
      <PageHeaderSkeleton />
      <StatTilesSkeleton count={4} />

      <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
            <Skeleton className="h-4 w-24 bg-slate-200" />
            <div className="mt-3 space-y-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-16 w-full rounded-xl bg-slate-200" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
