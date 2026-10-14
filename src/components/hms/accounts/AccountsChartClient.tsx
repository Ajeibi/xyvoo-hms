"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { ACCOUNT_TYPES, type AccountType, type ChartOfAccountRow } from "@/lib/hms/chart-of-accounts";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsEmptyState, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { Landmark, Plus, Receipt, Scale, TrendingUp, Wallet } from "lucide-react";

const TYPE_LABELS: Record<AccountType, string> = {
  asset: "Assets",
  liability: "Liabilities",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expenses",
};

const TYPE_ICONS: Record<AccountType, React.ComponentType<{ className?: string }>> = {
  asset: Wallet,
  liability: Landmark,
  equity: Scale,
  revenue: TrendingUp,
  expense: Receipt,
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
    <HmsPage>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Chart of accounts"
        description="The full list of accounts every journal entry posts against."
        actions={
          canManage ? (
            <>
              <button type="button" className={hmsButton.secondary} disabled={seeding} onClick={() => void seedTemplate()}>
                {seeding ? "Loading…" : "Load hospitality template"}
              </button>
              <button type="button" className={hmsButton.primary} onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" aria-hidden />
                Add account
              </button>
            </>
          ) : null
        }
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {accounts.length === 0 ? (
        <HmsEmptyState
          art="page"
          meaning="money"
          title="No accounts yet"
          description={
            canManage
              ? "Load the hospitality starter template, or add accounts one at a time."
              : "Accounts will appear here once someone with access sets them up."
          }
          action={
            canManage ? (
              <button type="button" className={hmsButton.primary} disabled={seeding} onClick={() => void seedTemplate()}>
                {seeding ? "Loading…" : "Load hospitality template"}
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-6">
          {ACCOUNT_TYPES.map((t) => {
            const rows = grouped.get(t) ?? [];
            if (rows.length === 0) return null;
            return (
              <HmsCard
                key={t}
                id={`accounts-chart-${t}`}
                title={TYPE_LABELS[t]}
                description={`${rows.length} ${rows.length === 1 ? "account" : "accounts"}`}
                icon={TYPE_ICONS[t]}
                meaning="money"
                flush
              >
                <ul className="divide-y divide-slate-100">
                  {rows.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm sm:px-6">
                      <div className="flex min-w-0 flex-wrap items-center gap-3">
                        <code className="w-14 shrink-0 font-mono text-sm tabular-nums text-slate-600">{a.code}</code>
                        <span className={a.isActive ? "font-medium text-slate-900" : "text-slate-600 line-through"}>{a.name}</span>
                        {a.isActive ? null : <HmsPill tone="slate">Inactive</HmsPill>}
                        <Link
                          href={`/hms/${slug}/accounts/ledger/${a.id}`}
                          className="rounded text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        >
                          View ledger<span className="sr-only"> for {a.name}</span>
                        </Link>
                      </div>
                      {canManage ? (
                        <button
                          type="button"
                          className={a.isActive ? hmsButton.danger : hmsButton.quiet}
                          disabled={busyIds.has(a.id)}
                          onClick={() => void toggleActive(a)}
                        >
                          {busyIds.has(a.id) ? "Saving…" : a.isActive ? "Deactivate" : "Reactivate"}
                          <span className="sr-only"> {a.name}</span>
                        </button>
                      ) : a.isActive ? (
                        <HmsPill tone="green">Active</HmsPill>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </HmsCard>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add account</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <HmsField id="coa-code" label="Code" hint="A short number that sorts the account, e.g. 4400.">
              <input id="coa-code" className={hmsInput} value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 4400" />
            </HmsField>
            <HmsField id="coa-name" label="Name">
              <input id="coa-name" className={hmsInput} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Spa Revenue" />
            </HmsField>
            <HmsField id="coa-type" label="Type">
              <select
                id="coa-type"
                className={hmsInput}
                value={type}
                onChange={(e) => setType(e.target.value as AccountType)}
              >
                {ACCOUNT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </HmsField>
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
    </HmsPage>
  );
}
