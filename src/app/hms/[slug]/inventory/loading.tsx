import {
  ListRowsSkeleton,
  PageHeaderSkeleton,
  StatTilesSkeleton,
  SubNavSkeleton,
  TableSkeleton,
} from "@/components/hms/PageSkeletons";

export default function InventoryLoading() {
  return (
    <div className="px-8 py-8">
      <PageHeaderSkeleton withAction />
      <SubNavSkeleton count={6} />
      <StatTilesSkeleton count={7} />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <TableSkeleton rows={5} cols={3} />
        <ListRowsSkeleton rows={5} />
      </div>
    </div>
  );
}
