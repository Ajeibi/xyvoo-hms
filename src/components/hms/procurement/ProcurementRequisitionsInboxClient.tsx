"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { SourceableRequisitionLine } from "@/lib/hms/procurement-types";

function groupByRequisition(lines: SourceableRequisitionLine[]) {
  const map = new Map<string, SourceableRequisitionLine[]>();
  for (const l of lines) {
    const list = map.get(l.requisitionId) ?? [];
    list.push(l);
    map.set(l.requisitionId, list);
  }
  return [...map.entries()];
}

export function ProcurementRequisitionsInboxClient({ slug, lines }: { slug: string; lines: SourceableRequisitionLine[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => groupByRequisition(lines), [lines]);

  const toggle = (lineId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(lineId)) next.delete(lineId);
      else next.add(lineId);
      return next;
    });
  };

  const createPoFromSelection = () => {
    const ids = [...selected];
    const query = ids.length ? `?lines=${ids.join(",")}` : "";
    router.push(`/hms/${slug}/procurement/orders/new${query}`);
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{lines.length} line item(s) awaiting sourcing.</p>
        <Button type="button" disabled={selected.size === 0} onClick={createPoFromSelection} className="rounded-lg">
          Create PO from {selected.size || ""} selected
        </Button>
      </div>

      {grouped.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-8 text-center text-sm text-slate-500">
          Nothing waiting on Procurement. New requisitions raised by Inventory or Admin/GM will appear here once approved.
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([requisitionId, group]) => (
            <div key={requisitionId} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="border-b border-slate-100 px-6 py-3">
                <p className="text-sm font-semibold text-slate-900">{group[0].requisitionNumber}</p>
                <p className="text-xs text-slate-500">{group[0].requestingDepartment}</p>
              </div>
              <ul className="divide-y divide-slate-100">
                {group.map((l) => (
                  <li key={l.requisitionLineId} className="flex items-center gap-3 px-6 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300"
                      checked={selected.has(l.requisitionLineId)}
                      onChange={() => toggle(l.requisitionLineId)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-slate-800">
                        {l.itemName} <span className="text-xs text-slate-400">({l.itemSku})</span>
                      </p>
                    </div>
                    <span className="shrink-0 text-xs tabular-nums text-slate-500">
                      {l.qtyRemaining} {l.unitOfMeasure} remaining
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
