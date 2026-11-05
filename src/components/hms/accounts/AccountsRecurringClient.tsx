"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CircleAlert, Play, Plus, Repeat, Trash2 } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { ACCOUNTS_DEPARTMENTS } from "@/lib/hms/accounts-departments";
import { monthStartOf } from "@/lib/hms/accounting-period-utils";
import type { BillPayload, JournalPayload, RecurringTemplate } from "@/lib/hms/recurring-entries";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsEmptyState, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type DraftLine = { accountId: string; debit: string; credit: string };

export function AccountsRecurringClient({
  slug,
  templates,
  accounts,
  vendors,
  currency,
  today,
  canManage,
  canAccessAllDepartments,
}: {
  slug: string;
  templates: RecurringTemplate[];
  accounts: { id: string; label: string; type: string }[];
  vendors: { id: string; name: string }[];
  currency: string;
  today: string;
  canManage: boolean;
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState<null | "journal" | "bill">(null);
  const [name, setName] = useState("");
  const [day, setDay] = useState("1");
  const [startMonth, setStartMonth] = useState(monthStartOf(today));
  const [endMonth, setEndMonth] = useState("");
  const [memo, setMemo] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ accountId: "", debit: "", credit: "" }, { accountId: "", debit: "", credit: "" }]);
  const [vendorId, setVendorId] = useState("");
  const [expenseId, setExpenseId] = useState("");
  const [department, setDepartment] = useState<string>("Accounts");
  const [subtotal, setSubtotal] = useState("");
  const [tax, setTax] = useState("0");

  const send = async (body: Record<string, unknown>, done: (d: Record<string, unknown>) => string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/accounts/recurring", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug, ...body }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { toastError("Could not save", data.error ?? "Try again."); return false; }
      toastSuccess(done(data));
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const debitTotal = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const creditTotal = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const common = { name, dayOfMonth: Number(day), startMonth, endMonth: endMonth || null };

  const create = async () => {
    const ok =
      adding === "journal"
        ? await send({ action: "create_journal", ...common, memo, lines: lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 })) }, () => "Recurring journal saved")
        : await send({ action: "create_bill", ...common, vendorId, department, expenseAccountId: expenseId, subtotal: Number(subtotal), tax: Number(tax) || 0, currency }, () => "Recurring bill saved");
    if (ok) { setAdding(null); setName(""); setMemo(""); setSubtotal(""); }
  };

  const describe = (t: RecurringTemplate) => {
    if (t.kind === "journal") {
      const p = t.payload as JournalPayload;
      return `Journal: ${p.memo}, ${fmt(p.lines.reduce((s, l) => s + l.debit, 0))}`;
    }
    const p = t.payload as BillPayload;
    return `Vendor bill: ${fmt(p.subtotal + p.tax)} ${p.currency} (${p.department})`;
  };

  return (
    <HmsPage wide>
      <HmsPageHeader eyebrow="Accounts" meaning="money" title="Recurring entries" description="Rent, subscriptions and salaries that repeat every month. Due entries are posted each morning on their own, and each month is posted only once." />
      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      <HmsCard
        id="recurring-list"
        title="Templates"
        icon={Repeat}
        meaning="money"
        flush
        actions={canManage ? (
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1">
            <button type="button" className={hmsButton.small} disabled={busy} onClick={() => void send({ action: "run" }, (d) => `Posted ${d.posted as number} entr${d.posted === 1 ? "y" : "ies"}`)}><Play className="h-4 w-4" aria-hidden /> Post what is due</button>
            <button type="button" className={hmsButton.small} onClick={() => setAdding("journal")}><Plus className="h-4 w-4" aria-hidden /> Journal</button>
            <button type="button" className={hmsButton.small} onClick={() => setAdding("bill")}><Plus className="h-4 w-4" aria-hidden /> Vendor bill</button>
          </div>
        ) : null}
      >
        {adding ? (
          <div className="space-y-3 border-b border-slate-100 p-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <HmsField id="rc-name" label="Name"><input id="rc-name" className={hmsInput} value={name} onChange={(e) => setName(e.target.value)} /></HmsField>
              <HmsField id="rc-day" label="Day of month (1 to 28)"><input id="rc-day" type="number" min="1" max="28" className={hmsInput} value={day} onChange={(e) => setDay(e.target.value)} /></HmsField>
              <HmsField id="rc-start" label="Starts"><input id="rc-start" type="month" className={hmsInput} value={startMonth.slice(0, 7)} onChange={(e) => setStartMonth(`${e.target.value}-01`)} /></HmsField>
              <HmsField id="rc-end" label="Ends (optional)"><input id="rc-end" type="month" className={hmsInput} value={endMonth.slice(0, 7)} onChange={(e) => setEndMonth(e.target.value ? `${e.target.value}-01` : "")} /></HmsField>
            </div>
            {adding === "journal" ? (
              <>
                <HmsField id="rc-memo" label="Memo"><input id="rc-memo" className={hmsInput} value={memo} onChange={(e) => setMemo(e.target.value)} /></HmsField>
                {lines.map((l, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_8rem_8rem]">
                    <select aria-label={`Line ${i + 1} account`} className={hmsInput} value={l.accountId} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, accountId: e.target.value } : x)))}>
                      <option value="">Account</option>
                      {accounts.map((a) => (<option key={a.id} value={a.id}>{a.label}</option>))}
                    </select>
                    <input aria-label={`Line ${i + 1} debit`} type="number" min="0" placeholder="Debit" className={`${hmsInput} tabular-nums`} value={l.debit} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, debit: e.target.value, credit: e.target.value ? "" : x.credit } : x)))} />
                    <input aria-label={`Line ${i + 1} credit`} type="number" min="0" placeholder="Credit" className={`${hmsInput} tabular-nums`} value={l.credit} onChange={(e) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, credit: e.target.value, debit: e.target.value ? "" : x.debit } : x)))} />
                  </div>
                ))}
                <div className="flex items-center gap-3 text-sm">
                  <button type="button" className={hmsButton.quiet} onClick={() => setLines((ls) => [...ls, { accountId: "", debit: "", credit: "" }])}>Add a line</button>
                  <span className={Math.abs(debitTotal - creditTotal) > 0.01 ? "text-red-700" : "text-emerald-700"}>Debits {fmt(debitTotal)}, credits {fmt(creditTotal)}</span>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <HmsField id="rc-vendor" label="Vendor"><select id="rc-vendor" className={hmsInput} value={vendorId} onChange={(e) => setVendorId(e.target.value)}><option value="">Pick one</option>{vendors.map((v) => (<option key={v.id} value={v.id}>{v.name}</option>))}</select></HmsField>
                <HmsField id="rc-expense" label="Expense account"><select id="rc-expense" className={hmsInput} value={expenseId} onChange={(e) => setExpenseId(e.target.value)}><option value="">Pick one</option>{accounts.filter((a) => a.type === "expense").map((a) => (<option key={a.id} value={a.id}>{a.label}</option>))}</select></HmsField>
                <HmsField id="rc-dept" label="Department"><select id="rc-dept" className={hmsInput} value={department} onChange={(e) => setDepartment(e.target.value)}>{ACCOUNTS_DEPARTMENTS.map((d) => (<option key={d} value={d}>{d}</option>))}</select></HmsField>
                <HmsField id="rc-sub" label={`Amount (${currency})`}><input id="rc-sub" type="number" min="0" className={`${hmsInput} tabular-nums`} value={subtotal} onChange={(e) => setSubtotal(e.target.value)} /></HmsField>
                <HmsField id="rc-tax" label="Tax"><input id="rc-tax" type="number" min="0" className={`${hmsInput} tabular-nums`} value={tax} onChange={(e) => setTax(e.target.value)} /></HmsField>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 sm:flex">
              <button type="button" className={hmsButton.primary} disabled={busy || !name.trim()} onClick={() => void create()}>{busy ? "Saving…" : "Save template"}</button>
              <button type="button" className={hmsButton.secondary} onClick={() => setAdding(null)}>Cancel</button>
            </div>
          </div>
        ) : null}

        {templates.length === 0 ? (
          <HmsEmptyState bare art="page" meaning="money" title="Nothing repeats yet" description="Add rent, a subscription or a salary run to post it every month." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {templates.map((t) => (
              <li key={t.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900">{t.name}</p>
                  <p className="text-sm text-slate-600">{describe(t)} · day {t.dayOfMonth} · next {t.active ? t.nextRunMonth.slice(0, 7) : "none"}</p>
                  {t.lastError ? <p className="mt-1 flex items-start gap-1.5 text-sm text-red-700"><CircleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />{t.lastError}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <HmsPill tone={t.active ? "green" : "blue"}>{t.active ? "Running" : "Paused"}</HmsPill>
                  {canManage ? (
                    <>
                      <button type="button" className={hmsButton.small} disabled={busy} onClick={() => void send({ action: "toggle", id: t.id, active: !t.active }, () => (t.active ? "Paused" : "Resumed"))}>{t.active ? "Pause" : "Resume"}</button>
                      <button type="button" className={hmsButton.danger} disabled={busy} onClick={() => void send({ action: "delete", id: t.id }, () => "Deleted")}><Trash2 className="h-4 w-4" aria-hidden /><span className="sr-only">Delete {t.name}</span></button>
                    </>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </HmsCard>
    </HmsPage>
  );
}
