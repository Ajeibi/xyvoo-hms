"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <div className="w-full px-6 py-8 sm:px-8">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Accounts settings</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Approval thresholds — the same bands used to gate purchase orders also decide when a vendor bill needs GM/Owner
          sign-off before it posts to the ledger. Managed here too so Accounts staff don&apos;t need Procurement access to
          see or change them.
        </p>
      </div>

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-slate-900">Approval thresholds</h2>
        <p className="mt-1 text-xs text-slate-500">
          Every vendor bill is checked against these bands by amount and department. The most specific match wins;
          everything defaults to requiring GM/Owner sign-off until you configure this.
        </p>

        <div className="mt-3 space-y-2">
          {thresholds.length === 0 ? (
            <p className="text-sm text-slate-500">No thresholds configured yet — every bill requires GM/Owner approval.</p>
          ) : (
            thresholds.map((t) => (
              <div key={t.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="text-slate-700">
                  {t.department}: {t.min_amount.toLocaleString()} – {t.max_amount === null ? "∞" : t.max_amount.toLocaleString()} →{" "}
                  <span className="font-medium">{APPROVER_LABELS[t.approver_role]}</span>
                </span>
                <button type="button" onClick={() => void removeThreshold(t.id)} className="text-slate-400 hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Input value={department} onChange={(e) => setDepartment(e.target.value)} placeholder="Department" />
          <Input type="number" min="0" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} placeholder="Min amount" />
          <Input type="number" min="0" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} placeholder="Max amount (blank = ∞)" />
          <Select value={approverRole} onValueChange={(v) => setApproverRole(v as ApproverRole)}>
            <SelectTrigger>
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
        <Button type="button" size="sm" className="mt-2 rounded-lg" disabled={submitting} onClick={() => void addThreshold()}>
          <Plus className="h-3.5 w-3.5" /> Add threshold
        </Button>
      </div>
    </div>
  );
}
