import { PageHeaderSkeleton } from "@/components/hms/PageSkeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function AccountsLoading() {
  return (
    <div className="max-w-4xl px-8 py-8">
      <PageHeaderSkeleton />

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <Skeleton className="mb-3 h-4 w-48 bg-slate-200" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
              <Skeleton className="h-4 w-64 bg-slate-200" />
              <Skeleton className="h-6 w-16 rounded-full bg-slate-200" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
