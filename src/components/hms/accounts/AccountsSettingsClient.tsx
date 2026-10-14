"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { HmsCard, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toastError, toastSuccess } from "@/lib/app-toast";
import type { ApprovalThresholdRow, ApproverRole } from "@/lib/hms/procurement-types";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";

const APPROVER_LABELS: Record<ApproverRole, string> = { auto: "Auto-approve", gm: "GM / Owner", finance: "Finance" };

export function AccountsSettingsClient({
  slug,
  thresholds,
  canAccessAllDepartments,
}: {
  slug: string;
  thresholds: ApprovalThresholdRow[];
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  const [department, setDepartment] = useState("All departments");
  const [minAmount, setMinAmount] = useState("0");
  const [maxAmount, setMaxAmount] = useState("");
  const [approverRole, setApproverRole] = useState<ApproverRole>("gm");
  const [submitting, setSubmitting] = useState(false);

  const addThreshold = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/hotel/procurement/approval-thresholds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          department: department.trim() || "All departments",
          minAmount: Number(minAmount) || 0,
          maxAmount: maxAmount ? Number(maxAmount) : null,
          approverRole,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not add threshold", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Approval threshold added");
      setMinAmount("0");
      setMaxAmount("");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const removeThreshold = async (id: string) => {
    const res = await fetch(`/api/hotel/procurement/approval-thresholds/${id}?slug=${encodeURIComponent(slug)}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toastError("Could not remove threshold", data.error ?? "Try again.");
      return;
    }
    router.refresh();
  };

  return (
    <HmsPage>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Accounts settings"
        description="Decide when a vendor bill needs sign-off before it posts to the ledger. These are the same limits Procurement uses for purchase orders, so Accounts staff can manage them without Procurement access."
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <HmsCard
        id="accounts-approval-thresholds"
        title="Approval thresholds"
        description="Every vendor bill is checked against these bands by amount and department. The most specific match wins."
        icon={ShieldCheck}
        meaning="money"
      >
        {thresholds.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
            <CircleAlert className="h-4 w-4 shrink-0" aria-hidden />
            No thresholds set yet, so every bill needs GM / Owner approval.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {thresholds.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="text-slate-700">
                  <span className="font-medium text-slate-900">{t.department}</span>:{" "}
                  <span className="tabular-nums">
                    {t.min_amount.toLocaleString()} to {t.max_amount === null ? "no upper limit" : t.max_amount.toLocaleString()}
                  </span>{" "}
                  → <HmsPill tone={t.approver_role === "auto" ? "green" : "blue"}>{APPROVER_LABELS[t.approver_role]}</HmsPill>
                </span>
                <button
                  type="button"
                  onClick={() => void removeThreshold(t.id)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-600 hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                  <span className="sr-only">
                    Remove threshold for {t.department}, {t.min_amount.toLocaleString()} and up
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-5 border-t border-slate-100 pt-5">
          <h3 className="text-sm font-semibold text-slate-900">Add a threshold</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <HmsField id="threshold-department" label="Department">
              <input id="threshold-department" className={hmsInput} value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" />
            </HmsField>
            <HmsField id="threshold-min" label="From amount">
              <input id="threshold-min" type="number" min="0" className={`${hmsInput} tabular-nums`} value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
            </HmsField>
            <HmsField id="threshold-max" label="Up to amount" hint="Leave blank for no upper limit.">
              <input
                id="threshold-max"
                type="number"
                min="0"
                aria-describedby="threshold-max-hint"
                className={`${hmsInput} tabular-nums`}
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
              />
            </HmsField>
            <div>
              <p id="threshold-approver-label" className="mb-1 block text-sm font-medium text-slate-800">
                Who approves
              </p>
              <Select value={approverRole} onValueChange={(v) => setApproverRole(v as ApproverRole)}>
                <SelectTrigger aria-labelledby="threshold-approver-label" className="h-auto rounded-xl border-slate-300 py-2.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(APPROVER_LABELS) as ApproverRole[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {APPROVER_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <button type="button" className={`${hmsButton.primary} mt-4`} disabled={submitting} onClick={() => void addThreshold()}>
            <Plus className="h-4 w-4" aria-hidden /> {submitting ? "Adding…" : "Add threshold"}
          </button>
        </div>
      </HmsCard>
    </HmsPage>
  );
}
