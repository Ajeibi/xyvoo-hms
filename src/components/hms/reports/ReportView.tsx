import { HmsCard, HmsEmptyState } from "@/components/hms/hms-ui";
import { cellValue, formatCell, type ReportDocument, type ReportSection } from "@/lib/hms/reports/model";

const NUMERIC = new Set(["money", "number", "percent"]);

function Table({ section, currency, id }: { section: ReportSection; currency: string; id: string }) {
  if (section.rows.length === 0) {
    return <HmsEmptyState bare icon={undefined} title={section.emptyMessage ?? "Nothing to show for this period."} />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-max text-sm">
        <caption className="sr-only">{section.title ?? "Report"}</caption>
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
            {section.columns.map((c) => (
              <th key={c.key} scope="col" className={`px-4 py-2.5 ${NUMERIC.has(c.kind) ? "text-right" : ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {section.rows.map((row, i) => (
            <tr key={`${id}-${i}`} className="text-slate-800">
              {section.columns.map((c, ci) => {
                const numeric = typeof cellValue(row[c.key]) === "number";
                const Cell = ci === 0 ? "th" : "td";
                return (
                  <Cell key={c.key} scope={ci === 0 ? "row" : undefined} className={`px-4 py-2.5 ${ci === 0 ? "text-left font-medium" : "font-normal"} ${numeric ? "text-right tabular-nums" : ""}`}>
                    {formatCell(row[c.key], c, currency)}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
        {section.totals ? (
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
              {section.columns.map((c, ci) => (
                <td key={c.key} className={`px-4 py-2.5 ${typeof cellValue(section.totals?.[c.key]) === "number" ? "text-right tabular-nums" : ""} ${ci === 0 ? "text-left" : ""}`}>
                  {section.totals?.[c.key] == null ? "" : formatCell(section.totals[c.key], c, currency)}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

/** Shows a report document: each section as a table, then the notes on how it was worked out. */
export function ReportView({ document }: { document: ReportDocument }) {
  return (
    <div className="space-y-4">
      {document.sections.map((s, i) => (
        <HmsCard key={`${document.key}-${i}`} id={`${document.key}-${i}`} title={s.title} flush>
          <Table section={s} currency={document.currency} id={`${document.key}-${i}`} />
        </HmsCard>
      ))}
      {document.notes.length > 0 ? (
        <section aria-label="How these figures are worked out" className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">How these figures are worked out</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {document.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
