import { CardBlockSkeleton, PageHeaderSkeleton, StatTilesSkeleton } from "@/components/hms/PageSkeletons";

export default function DashboardLoading() {
  return (
    <div className="mx-auto w-full max-w-[1500px] px-6 py-8 sm:px-8">
      <PageHeaderSkeleton withAction />
      <StatTilesSkeleton count={4} />

      <div className="mt-6 space-y-4">
        <CardBlockSkeleton lines={4} />

        <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <CardBlockSkeleton lines={5} />
          <CardBlockSkeleton lines={5} />
        </div>

        <div className="grid items-stretch gap-4 lg:grid-cols-2">
          <CardBlockSkeleton lines={4} />
          <CardBlockSkeleton lines={4} />
        </div>

        <div className="grid items-stretch gap-4 xl:grid-cols-2">
          <CardBlockSkeleton lines={4} />
          <CardBlockSkeleton lines={4} />
        </div>

        <div className="grid items-stretch gap-4 xl:grid-cols-2">
          <CardBlockSkeleton lines={4} />
          <CardBlockSkeleton lines={4} />
        </div>
      </div>
    </div>
  );
}
