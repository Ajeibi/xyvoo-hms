import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared building blocks for route-level `loading.tsx` skeletons across the
 * HMS dashboard. Kept plain (no data-fetching) since Next.js renders these
 * as static fallbacks while the real page's async Server Component streams in.
 */
const sk = "bg-slate-200";

export function PageHeaderSkeleton({ withAction = false }: { withAction?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className={`h-6 w-40 ${sk}`} />
        <Skeleton className={`h-4 w-72 ${sk}`} />
      </div>
      {withAction ? <Skeleton className={`h-11 w-40 rounded-xl ${sk}`} /> : null}
    </div>
  );
}

export function SubNavSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className={`h-8 w-20 rounded-lg ${sk}`} />
      ))}
    </div>
  );
}

export function StatTilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-5">
          <Skeleton className={`h-3 w-24 ${sk}`} />
          <Skeleton className={`mt-3 h-7 w-16 ${sk}`} />
          <Skeleton className={`mt-2 h-4 w-full ${sk}`} />
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex gap-8 border-b border-slate-100 bg-slate-50 px-6 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={`h-3 w-16 ${sk}`} />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-8 px-6 py-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className={`h-4 w-20 ${sk}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardBlockSkeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 ${className}`}>
      <Skeleton className={`h-4 w-32 ${sk}`} />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={`h-4 ${i === lines - 1 ? "w-2/3" : "w-full"} ${sk}`} />
        ))}
      </div>
    </div>
  );
}

/** Matches DepartmentDashboardScaffold's shape (maintenance, HR, revenue). */
export function DepartmentDashboardSkeleton() {
  return (
    <div className="mx-auto w-full max-w-6xl px-8 py-8">
      <PageHeaderSkeleton withAction />
      <StatTilesSkeleton count={3} />
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <Skeleton className={`h-4 w-40 ${sk}`} />
        <div className="mt-3 space-y-2">
          <Skeleton className={`h-4 w-full ${sk}`} />
          <Skeleton className={`h-4 w-full ${sk}`} />
          <Skeleton className={`h-4 w-2/3 ${sk}`} />
        </div>
      </div>
    </div>
  );
}

export function ListRowsSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-6 py-4">
          <div className="space-y-2">
            <Skeleton className={`h-4 w-48 ${sk}`} />
            <Skeleton className={`h-3 w-32 ${sk}`} />
          </div>
          <Skeleton className={`h-8 w-24 rounded-lg ${sk}`} />
        </div>
      ))}
    </div>
  );
}
