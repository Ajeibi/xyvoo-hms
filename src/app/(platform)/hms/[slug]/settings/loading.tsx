import { CardBlockSkeleton } from "@/components/hms/PageSkeletons";

export default function SettingsLoading() {
  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-6 px-3 py-4 sm:px-8 sm:py-8">
      <CardBlockSkeleton lines={3} />
      <CardBlockSkeleton lines={4} />
      <CardBlockSkeleton lines={3} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <CardBlockSkeleton lines={3} />
        <CardBlockSkeleton lines={3} />
        <CardBlockSkeleton lines={3} />
      </div>

      <CardBlockSkeleton lines={3} />
      <CardBlockSkeleton lines={3} />
    </div>
  );
}
