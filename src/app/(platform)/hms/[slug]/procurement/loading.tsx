import {
  ListRowsSkeleton,
  PageHeaderSkeleton,
  StatTilesSkeleton,
  SubNavSkeleton,
  TableSkeleton,
} from "@/components/hms/PageSkeletons";

export default function ProcurementLoading() {
  return (
    <div className="mx-auto w-full max-w-375 px-3 py-3 sm:px-6 sm:py-8 lg:px-8">
      <PageHeaderSkeleton withAction />
      <SubNavSkeleton count={6} />
      <StatTilesSkeleton count={6} />

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <TableSkeleton rows={5} cols={4} />
        <ListRowsSkeleton rows={5} />
      </div>
    </div>
  );
}
