"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList } from "lucide-react";
import { HmsCard, HmsEmptyState, hmsButton } from "@/components/hms/hms-ui";
import { HmsSectionIntro } from "@/components/hms/hms-ui-client";
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
    <div className="space-y-6">
      <HmsSectionIntro
        id="procurement-requisitions"
        title="Turn approved requests into orders"
        meaning="team"
        art="page"
        points={[
          "Approved requisitions from Inventory and Admin/GM wait here.",
          "Tick the lines you want to buy, then create one purchase order for them.",
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700" role="status">
          <span className="font-semibold tabular-nums text-slate-900">{lines.length}</span> {lines.length === 1 ? "line item" : "line items"} awaiting sourcing
          {selected.size ? (
            <>
              {" "}
              · <span className="font-semibold tabular-nums text-slate-900">{selected.size}</span> selected
            </>
          ) : null}
        </p>
        <button type="button" disabled={selected.size === 0} onClick={createPoFromSelection} className={hmsButton.primary}>
          Create PO from {selected.size || ""} selected
        </button>
      </div>

      {grouped.length === 0 ? (
        <HmsEmptyState
          art="page"
          meaning="team"
          title="Nothing waiting on Procurement"
          description="New requisitions raised by Inventory or Admin/GM will appear here once approved."
        />
      ) : (
        <div className="space-y-4">
          {grouped.map(([requisitionId, group]) => (
            <HmsCard
              key={requisitionId}
              id={`requisition-${requisitionId}`}
              title={group[0].requisitionNumber}
              description={group[0].requestingDepartment}
              icon={ClipboardList}
              meaning="team"
              flush
            >
              <ul className="divide-y divide-slate-100">
                {group.map((l) => (
                  <li key={l.requisitionLineId}>
                    <label
                      htmlFor={`req-line-${l.requisitionLineId}`}
                      className="flex cursor-pointer items-center gap-3 px-5 py-3 hover:bg-slate-50 sm:px-6"
                    >
                      <input
                        id={`req-line-${l.requisitionLineId}`}
                        type="checkbox"
                        className="h-5 w-5 shrink-0 rounded border-slate-300 text-indigo-700 focus-visible:ring-2 focus-visible:ring-blue-500"
                        checked={selected.has(l.requisitionLineId)}
                        onChange={() => toggle(l.requisitionLineId)}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                        {l.itemName} <span className="font-normal text-slate-600">({l.itemSku})</span>
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-slate-700">
                        {l.qtyRemaining} {l.unitOfMeasure} remaining
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            </HmsCard>
          ))}
        </div>
      )}
    </div>
  );
}
