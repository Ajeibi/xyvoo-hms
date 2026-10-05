import { KitchenKdsSkeleton } from "@/components/hms/fb/FbPageSkeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function KitchenLoading() {
  return (
    <div className="w-full space-y-4 px-6 py-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32 bg-slate-200" />
        <Skeleton className="h-4 w-48 bg-slate-200" />
      </div>
      <KitchenKdsSkeleton />
    </div>
  );
}
