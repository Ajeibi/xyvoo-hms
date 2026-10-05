import { ListRowsSkeleton, PageHeaderSkeleton } from "@/components/hms/PageSkeletons";

export default function HousekeepingLoading() {
  return (
    <div className="px-8 py-8">
      <PageHeaderSkeleton />
      <ListRowsSkeleton rows={6} />
    </div>
  );
}
