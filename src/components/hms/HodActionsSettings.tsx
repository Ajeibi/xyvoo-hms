"use client";

import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import { HmsCard } from "@/components/hms/hms-ui";
import { HOD_ACTIONS, HOD_ACTION_LABELS, type HodAction } from "@/lib/hms/capabilities";
import { toastError, toastSuccess } from "@/lib/app-toast";

export type HodOnlyByDepartment = { department: string; hodOnly: HodAction[] };

/**
 * Which actions need a head of department, per department. Ticked means staff in that department can't
 * do it alone; a HOD does it, or approves it on the spot. Defaults are sensible; change them per hotel.
 */
export default function HodActionsSettings({ slug, initial }: { slug: string; initial: HodOnlyByDepartment[] }) {
  const [rows, setRows] = useState(initial);
  const [saving, setSaving] = useState<string | null>(null);

  const toggle = async (department: string, action: HodAction, enabled: boolean) => {
    const key = `${department}:${action}`;
    setSaving(key);
    const res = await fetch("/api/hotel/staff/hod-actions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, department_role: department, action_key: action, enabled }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(null);
    if (!res.ok) {
      toastError("Could not save", data.error || "Please try again.");
      return;
    }
    setRows((current) => current.map((r) => (r.department === department ? { ...r, hodOnly: data.hodOnly } : r)));
    toastSuccess("Saved");
  };

  return (
    <HmsCard
      id="hod-only-actions"
      title="Actions that need a head of department"
      description="Staff can't do these on their own. A head of department does them, or approves them with their own PIN."
      icon={ShieldAlert}
      meaning="team"
      flush
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <caption className="sr-only">Actions that need a head of department, by department</caption>
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th scope="col" className="px-5 py-3 text-left text-sm font-semibold text-slate-700">
                Department
              </th>
              {HOD_ACTIONS.map((a) => (
                <th key={a} scope="col" title={HOD_ACTION_LABELS[a].hint} className="px-2 py-3 text-center text-xs font-semibold text-slate-700">
                  {HOD_ACTION_LABELS[a].label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {rows.map((row) => (
              <tr key={row.department}>
                <th scope="row" className="px-5 py-3 text-left text-sm font-medium text-slate-900">
                  {row.department}
                </th>
                {HOD_ACTIONS.map((a) => {
                  const on = row.hodOnly.includes(a);
                  return (
                    <td key={a} className="px-2 py-3 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-blue-700"
                        checked={on}
                        disabled={saving === `${row.department}:${a}`}
                        aria-label={`${HOD_ACTION_LABELS[a].label} need a head of department in ${row.department}`}
                        onChange={(e) => void toggle(row.department, a, e.target.checked)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </HmsCard>
  );
}
