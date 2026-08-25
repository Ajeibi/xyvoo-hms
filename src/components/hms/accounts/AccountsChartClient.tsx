"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { ACCOUNT_TYPES, type AccountType, type ChartOfAccountRow } from "@/lib/hms/chart-of-accounts";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";

const TYPE_LABELS: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
};

export function AccountsChartClient({
  slug,
  accounts,
  canManage,
  canAccessAllDepartments,
}: {
  slug: string;
  accounts: ChartOfAccountRow[];
  canManage: boolean;
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  const [seeding, setSeeding] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("expense");
  const [saving, setSaving] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const map = new Map<AccountType, ChartOfAccountRow[]>();
    for (const t of ACCOUNT_TYPES) map.set(t, []);
    for (const a of accounts) map.get(a.type)?.push(a);
    return map;
  }, [accounts]);

  const seedTemplate = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/hotel/accounts/chart-of-accounts/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not load template", data.error ?? "Try again.");
        return;
      }
      toastSuccess(data.inserted > 0 ? `Added ${data.inserted} accounts.` : "Starter accounts already exist.");
      router.refresh();
    } finally {
      setSeeding(false);
    }
  };

  const addAccount = async () => {
    if (!code.trim() || !name.trim()) {
      toastError("Code and name required", "Fill in both fields.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/hotel/accounts/chart-of-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, code: code.trim(), name: name.trim(), type }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not create account", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Account created.");
      setAddOpen(false);
      setCode("");
      setName("");
      setType("expense");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (account: ChartOfAccountRow) => {
    setBusyIds((prev) => new Set(prev).add(account.id));
    try {
      const res = await fetch(`/api/hotel/accounts/chart-of-accounts/${account.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, isActive: !account.isActive }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not update account", data.error ?? "Try again.");
        return;
      }
      toastSuccess(account.isActive ? "Account deactivated." : "Account reactivated.");
      router.refresh();
    } finally {
      setBusyIds((prev) => {
        const next = new Set(prev);
        next.delete(account.id);
        return next;
      });
    }
  };

  return (
    <div className="w-full px-6 py-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Chart of accounts</h1>
          <p className="mt-0.5 text-sm text-slate-500">The full list of accounts every journal entry posts against.</p>
        </div>
        {canManage ? (
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={seeding} onClick={() => void seedTemplate()}>
              {seeding ? "Loading…" : "Load hospitality template"}
            </Button>
            <Button type="button" onClick={() => setAddOpen(true)}>
              Add account
            </Button>
          </div>
        ) : null}
      </div>

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {accounts.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
          No accounts yet. Load the hospitality starter template above, or add one manually.
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {ACCOUNT_TYPES.map((t) => {
            const rows = grouped.get(t) ?? [];
            if (rows.length === 0) return null;
            return (
              <div key={t} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-2.5">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{TYPE_LABELS[t]}</h2>
                </div>
                <div className="divide-y divide-slate-100">
                  {rows.map((a) => (
                    <div key={a.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="flex items-center gap-3">
                        <code className="w-14 shrink-0 font-mono text-xs text-slate-500">{a.code}</code>
                        <span className={a.isActive ? "text-slate-900" : "text-slate-400 line-through"}>{a.name}</span>
                      </div>
                      {canManage ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          disabled={busyIds.has(a.id)}
                          onClick={() => void toggleActive(a)}
                        >
                          {busyIds.has(a.id) ? "Saving…" : a.isActive ? "Deactivate" : "Reactivate"}
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-400">{a.isActive ? "Active" : "Inactive"}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add account</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Code</p>
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 4400" />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Name</p>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spa Revenue" />
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Type</p>
              <select
                className="h-10 w-full rounded-lg border border-input px-3 text-sm"
                value={type}
                onChange={(e) => setType(e.target.value as AccountType)}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={saving} onClick={() => void addAccount()}>
              {saving ? "Saving…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
