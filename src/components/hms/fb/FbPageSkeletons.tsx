import { Skeleton } from "@/components/ui/skeleton";

const sk = "bg-slate-200";

export function FbPosSkeleton() {
  return (
    <div className="w-full space-y-4 px-6 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className={`h-7 w-14 ${sk}`} />
          <Skeleton className={`h-4 w-52 ${sk}`} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className={`h-10 w-28 rounded-xl ${sk}`} />
          <Skeleton className={`h-10 w-16 rounded-xl ${sk}`} />
        </div>
      </div>

      <div className="max-w-xs space-y-1">
        <Skeleton className={`h-3 w-12 ${sk}`} />
        <Skeleton className={`h-10 w-full rounded-lg ${sk}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
              <Skeleton className={`mb-3 h-4 w-20 ${sk}`} />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, j) => (
                  <Skeleton key={j} className={`h-[68px] rounded-xl ${sk}`} />
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <Skeleton className={`h-4 w-28 ${sk}`} />
          <Skeleton className={`mt-4 h-4 w-full ${sk}`} />
          <Skeleton className={`mt-2 h-4 w-3/4 ${sk}`} />
          <Skeleton className={`mt-2 h-4 w-1/2 ${sk}`} />
          <Skeleton className={`mt-4 h-7 w-24 ${sk}`} />
          <div className="mt-4 flex flex-col gap-2">
            <Skeleton className={`h-10 w-full rounded-md ${sk}`} />
            <Skeleton className={`h-10 w-full rounded-md ${sk}`} />
            <Skeleton className={`h-10 w-full rounded-md ${sk}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

export function FbTablesSkeleton() {
  return (
    <div className="w-full px-6 py-6">
      <Skeleton className={`h-7 w-24 ${sk}`} />
      <Skeleton className={`mt-2 h-4 w-64 ${sk}`} />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
            <Skeleton className={`h-7 w-12 ${sk}`} />
            <Skeleton className={`mt-2 h-3 w-16 ${sk}`} />
            <Skeleton className={`mt-2 h-3 w-20 ${sk}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function FbOrdersSkeleton() {
  return (
    <div className="w-full space-y-4 px-6 py-6">
      <div className="space-y-2">
        <Skeleton className={`h-7 w-32 ${sk}`} />
        <Skeleton className={`h-4 w-48 ${sk}`} />
      </div>

      <div className="max-w-md space-y-1">
        <Skeleton className={`h-3 w-56 ${sk}`} />
        <Skeleton className={`h-10 w-full rounded-xl ${sk}`} />
      </div>

      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-2">
                <Skeleton className={`h-5 w-24 ${sk}`} />
                <Skeleton className={`h-4 w-40 ${sk}`} />
              </div>
              <Skeleton className={`h-7 w-20 ${sk}`} />
            </div>
            <div className="mt-3 space-y-2">
              <Skeleton className={`h-4 w-full ${sk}`} />
              <Skeleton className={`h-4 w-3/4 ${sk}`} />
            </div>
            <div className="mt-4 flex gap-2">
              <Skeleton className={`h-9 w-28 rounded-md ${sk}`} />
              <Skeleton className={`h-9 w-24 rounded-md ${sk}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function FbSettingsSkeleton() {
  return (
    <div className="w-full space-y-6 px-6 py-6">
      <div className="space-y-2">
        <Skeleton className={`h-7 w-36 ${sk}`} />
        <Skeleton className={`h-4 w-56 ${sk}`} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Skeleton className={`h-10 w-28 rounded-xl ${sk}`} />
        <Skeleton className={`h-10 w-16 rounded-xl ${sk}`} />
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <Skeleton className={`h-4 w-32 ${sk}`} />
        <Skeleton className={`mt-3 h-4 w-64 ${sk}`} />
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <Skeleton className={`h-4 w-28 ${sk}`} />
        <div className="grid gap-3 md:grid-cols-4">
          <Skeleton className={`h-10 rounded-md ${sk}`} />
          <Skeleton className={`h-10 rounded-md ${sk}`} />
          <Skeleton className={`h-10 rounded-md ${sk}`} />
          <Skeleton className={`h-10 rounded-md ${sk}`} />
        </div>
        <div className="divide-y divide-slate-100">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between py-3">
              <Skeleton className={`h-4 w-32 ${sk}`} />
              <Skeleton className={`h-4 w-16 ${sk}`} />
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
        <Skeleton className={`h-4 w-36 ${sk}`} />
        <div className="flex flex-wrap gap-2">
          <Skeleton className={`h-10 w-[120px] rounded-md ${sk}`} />
          <Skeleton className={`h-10 w-[100px] rounded-md ${sk}`} />
          <Skeleton className={`h-10 w-24 rounded-md ${sk}`} />
        </div>
        <div className="flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className={`h-8 w-20 rounded-lg ${sk}`} />
          ))}
        </div>
      </section>
    </div>
  );
}

export function KitchenKdsSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-2xl border-2 border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <Skeleton className={`h-6 w-16 ${sk}`} />
              <Skeleton className={`h-4 w-20 ${sk}`} />
            </div>
            <Skeleton className={`h-8 w-10 rounded-lg ${sk}`} />
          </div>
          <div className="mt-3 space-y-2">
            {[0, 1].map((j) => (
              <div key={j} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <Skeleton className={`h-4 w-full ${sk}`} />
                <Skeleton className={`mt-2 h-3 w-16 ${sk}`} />
                <div className="mt-2 flex gap-1">
                  <Skeleton className={`h-8 w-20 rounded-md ${sk}`} />
                  <Skeleton className={`h-8 w-16 rounded-md ${sk}`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function KitchenHistorySkeleton() {
  return (
    <div className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex gap-8">
          {["w-14", "w-14", "w-16", "w-12", "w-24"].map((w, i) => (
            <Skeleton key={i} className={`h-3 ${w} ${sk}`} />
          ))}
        </div>
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-8 px-4 py-3">
            <Skeleton className={`h-4 w-16 ${sk}`} />
            <Skeleton className={`h-4 w-20 ${sk}`} />
            <Skeleton className={`h-4 w-16 ${sk}`} />
            <Skeleton className={`h-4 w-8 ${sk}`} />
            <Skeleton className={`h-4 w-10 ${sk}`} />
          </div>
        ))}
      </div>
    </div>
  );
}
