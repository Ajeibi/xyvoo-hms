import { PageHeaderSkeleton } from "@/components/hms/PageSkeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { HmsPage } from "@/components/hms/hms-ui";

export default function AccountsLoading() {
  return (
    <HmsPage>
      <PageHeaderSkeleton />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-2xl bg-slate-100" />
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
        <Skeleton className="mb-4 h-5 w-48 bg-slate-200" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
              <Skeleton className="h-4 w-64 bg-slate-200" />
              <Skeleton className="h-6 w-16 rounded-full bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </HmsPage>
  );
}
