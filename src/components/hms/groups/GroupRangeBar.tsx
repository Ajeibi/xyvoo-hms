import { Download } from "lucide-react";
import { HmsCard, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import type { GroupReportKey } from "@/lib/hms/groups/group-reports";

/** A date range picker (a plain form, so it works without JavaScript) and the file downloads. */
export function GroupRangeBar({
  action,
  from,
  to,
  keep,
  exportBase,
  report,
}: {
  action: string;
  from: string;
  to: string;
  /** Other query values to keep (for example the tab). */
  keep?: Record<string, string>;
  exportBase: string;
  report: GroupReportKey;
}) {
  const q = (format: string) => `${exportBase}?report=${report}&from=${from}&to=${to}&format=${format}`;
  return (
    <HmsCard>
      <div className="flex flex-wrap items-end gap-3">
        <form action={action} method="get" className="flex flex-wrap items-end gap-3">
          {Object.entries(keep ?? {}).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}
          <div>
            <label htmlFor="range-from" className="mb-1 block text-sm font-medium text-slate-800">
              From
            </label>
            <input id="range-from" name="from" type="date" defaultValue={from} className={hmsInput} />
          </div>
          <div>
            <label htmlFor="range-to" className="mb-1 block text-sm font-medium text-slate-800">
              To
            </label>
            <input id="range-to" name="to" type="date" defaultValue={to} className={hmsInput} />
          </div>
          <button type="submit" className={hmsButton.primary}>
            Show
          </button>
        </form>
        <div className="ml-auto flex flex-wrap gap-2" aria-label="Download">
          {(["xlsx", "pdf", "csv"] as const).map((f) => (
            <a key={f} href={q(f)} className={hmsButton.small}>
              <Download className="h-4 w-4" aria-hidden />
              {f === "xlsx" ? "Excel" : f.toUpperCase()}
            </a>
          ))}
        </div>
      </div>
    </HmsCard>
  );
}
