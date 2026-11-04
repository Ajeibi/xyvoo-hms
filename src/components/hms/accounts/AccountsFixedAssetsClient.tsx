"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boxes, Plus, TrendingDown } from "lucide-react";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { addMonths, monthStartOf } from "@/lib/hms/accounting-periods";
import { DEPRECIATION_METHOD_LABELS, type DepreciationMethod, type FixedAssetRow } from "@/lib/hms/fixed-assets";
import { AccountsSubNav } from "@/components/hms/accounts/AccountsSubNav";
import { HmsCard, HmsEmptyState, HmsField, HmsPage, HmsPageHeader, HmsPill, hmsButton, hmsInput } from "@/components/hms/hms-ui";

const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AccountsFixedAssetsClient({
  slug,
  assets,
  payAccounts,
  today,
  canManage,
  canAccessAllDepartments,
}: {
  slug: string;
  assets: FixedAssetRow[];
  payAccounts: { id: string; label: string }[];
  today: string;
  canManage: boolean;
  canAccessAllDepartments: boolean;
}) {
  const router = useRouter();
  const lastFinished = addMonths(monthStartOf(today), -1);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("Equipment");
  const [acquisitionDate, setAcquisitionDate] = useState(today);
  const [cost, setCost] = useState("");
  const [salvage, setSalvage] = useState("0");
  const [lifeYears, setLifeYears] = useState("5");
  const [method, setMethod] = useState<DepreciationMethod>("straight_line");
  const [paidFrom, setPaidFrom] = useState("");
  const [throughMonth, setThroughMonth] = useState(lastFinished);
  const [disposing, setDisposing] = useState<string | null>(null);
  const [disposedOn, setDisposedOn] = useState(today);
  const [proceeds, setProceeds] = useState("0");

  const send = async (body: Record<string, unknown>, done: (data: Record<string, unknown>) => string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/hotel/accounts/fixed-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, ...body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toastError("Could not save", data.error ?? "Try again.");
        return false;
      }
      toastSuccess(done(data));
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  };

  const active = assets.filter((a) => a.status === "active");
  const totalBook = active.reduce((s, a) => s + a.bookValue, 0);

  return (
    <HmsPage>
      <HmsPageHeader
        eyebrow="Accounts"
        meaning="money"
        title="Fixed assets"
        description="Register what the hotel owns, post depreciation each month, and record disposals. Every posting goes through the books."
      />

      <AccountsSubNav slug={slug} canAccessAllDepartments={canAccessAllDepartments} />

      {canManage ? (
        <HmsCard id="depreciation-run" title="Monthly depreciation" icon={TrendingDown} meaning="money" description="Posts every month not yet posted, up to and including the one you pick. Running it twice does nothing the second time.">
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-48">
              <HmsField id="dep-through" label="Post through">
                <input id="dep-through" type="month" className={hmsInput} max={lastFinished.slice(0, 7)} value={throughMonth.slice(0, 7)} onChange={(e) => setThroughMonth(`${e.target.value}-01`)} />
              </HmsField>
            </div>
            <button
              type="button"
              className={hmsButton.primary}
              disabled={busy || active.length === 0}
              onClick={() => void send({ action: "depreciate", throughMonth }, (d) => `Posted ${(d.monthsPosted as string[]).length} month(s), ${fmt(Number(d.total))} in total`)}
            >
              {busy ? "Posting…" : "Post depreciation"}
            </button>
          </div>
        </HmsCard>
      ) : null}

      <HmsCard
        id="fixed-asset-register"
        title="Asset register"
        icon={Boxes}
        meaning="money"
        flush
        actions={
          canManage ? (
            <button type="button" className={hmsButton.small} onClick={() => setAdding((v) => !v)}>
              <Plus className="h-4 w-4" aria-hidden /> Add asset
            </button>
          ) : null
        }
      >
        {adding ? (
          <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-5 sm:grid-cols-2 lg:grid-cols-4">
            <HmsField id="fa-name" label="Name"><input id="fa-name" className={hmsInput} value={name} onChange={(e) => setName(e.target.value)} /></HmsField>
            <HmsField id="fa-category" label="Category"><input id="fa-category" className={hmsInput} value={category} onChange={(e) => setCategory(e.target.value)} /></HmsField>
            <HmsField id="fa-date" label="Bought on"><input id="fa-date" type="date" className={hmsInput} value={acquisitionDate} onChange={(e) => setAcquisitionDate(e.target.value)} /></HmsField>
            <HmsField id="fa-cost" label="Cost"><input id="fa-cost" type="number" min="0" className={`${hmsInput} tabular-nums`} value={cost} onChange={(e) => setCost(e.target.value)} /></HmsField>
            <HmsField id="fa-salvage" label="Value at end of life"><input id="fa-salvage" type="number" min="0" className={`${hmsInput} tabular-nums`} value={salvage} onChange={(e) => setSalvage(e.target.value)} /></HmsField>
            <HmsField id="fa-life" label="Life (years)"><input id="fa-life" type="number" min="1" step="0.5" className={`${hmsInput} tabular-nums`} value={lifeYears} onChange={(e) => setLifeYears(e.target.value)} /></HmsField>
            <HmsField id="fa-method" label="Method">
              <select id="fa-method" className={hmsInput} value={method} onChange={(e) => setMethod(e.target.value as DepreciationMethod)}>
                {(Object.keys(DEPRECIATION_METHOD_LABELS) as DepreciationMethod[]).map((m) => (
                  <option key={m} value={m}>{DEPRECIATION_METHOD_LABELS[m]}</option>
                ))}
              </select>
            </HmsField>
            <HmsField id="fa-paid" label="Post the purchase now?" hint="Pick where the money came from, or leave blank if it is already on the books.">
              <select id="fa-paid" className={hmsInput} value={paidFrom} onChange={(e) => setPaidFrom(e.target.value)}>
                <option value="">No, already posted</option>
                {payAccounts.map((a) => (<option key={a.id} value={a.id}>{a.label}</option>))}
              </select>
            </HmsField>
            <div className="sm:col-span-2 lg:col-span-4">
              <button
                type="button"
                className={hmsButton.primary}
                disabled={busy || !name.trim() || !Number(cost)}
                onClick={async () => {
                  const ok = await send(
                    {
                      action: "create",
                      name,
                      category,
                      acquisitionDate,
                      cost: Number(cost),
                      salvageValue: Number(salvage) || 0,
                      lifeMonths: Math.round(Number(lifeYears) * 12),
                      method,
                      paidFromAccountId: paidFrom || null,
                    },
                    (d) => `${d.assetCode as string} registered`,
                  );
                  if (ok) { setAdding(false); setName(""); setCost(""); }
                }}
              >
                {busy ? "Saving…" : "Register asset"}
              </button>
            </div>
          </div>
        ) : null}

        {assets.length === 0 ? (
          <HmsEmptyState bare art="chart" meaning="money" title="No assets registered yet" description="Add furniture, equipment and vehicles to depreciate them." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-sm font-medium text-slate-600">
                <tr>
                  <th scope="col" className="px-5 py-3">Asset</th>
                  <th scope="col" className="px-5 py-3 text-right">Cost</th>
                  <th scope="col" className="px-5 py-3 text-right">Depreciated</th>
                  <th scope="col" className="px-5 py-3 text-right">Book value</th>
                  <th scope="col" className="px-5 py-3">Status</th>
                  <th scope="col" className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {assets.map((a) => (
                  <tr key={a.id} className="border-b border-slate-100 align-top">
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-900"><code className="mr-2 font-mono text-xs text-slate-600">{a.assetCode}</code>{a.name}</p>
                      <p className="text-slate-600">{a.category} · {DEPRECIATION_METHOD_LABELS[a.method]} · {(a.lifeMonths / 12).toFixed(1)} years · bought {a.acquisitionDate}</p>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmt(a.cost)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmt(a.accumulated)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-medium">{fmt(a.bookValue)}</td>
                    <td className="px-5 py-3">
                      <HmsPill tone={a.status === "active" ? "green" : "blue"}>{a.status === "active" ? "In use" : `Disposed ${a.disposedOn ?? ""}`}</HmsPill>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {canManage && a.status === "active" ? (
                        disposing === a.id ? (
                          <div className="flex flex-wrap items-end justify-end gap-2">
                            <input aria-label="Date disposed" type="date" className={`${hmsInput} w-40`} value={disposedOn} max={today} onChange={(e) => setDisposedOn(e.target.value)} />
                            <input aria-label="Money received" type="number" min="0" className={`${hmsInput} w-32 tabular-nums`} value={proceeds} onChange={(e) => setProceeds(e.target.value)} />
                            <button
                              type="button"
                              className={hmsButton.small}
                              disabled={busy}
                              onClick={async () => {
                                const ok = await send({ action: "dispose", assetId: a.id, disposedOn, proceeds: Number(proceeds) || 0 }, (d) => `Disposed of. ${Number(d.gain) >= 0 ? "Gain" : "Loss"} of ${fmt(Math.abs(Number(d.gain)))}`);
                                if (ok) setDisposing(null);
                              }}
                            >
                              Confirm
                            </button>
                            <button type="button" className={hmsButton.quiet} onClick={() => setDisposing(null)}>Cancel</button>
                          </div>
                        ) : (
                          <button type="button" className={hmsButton.small} onClick={() => { setDisposing(a.id); setProceeds("0"); }}>Dispose</button>
                        )
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold text-slate-900">
                  <th scope="row" colSpan={3} className="px-5 py-3 text-left">Book value of assets in use</th>
                  <td className="px-5 py-3 text-right tabular-nums">{fmt(totalBook)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </HmsCard>
    </HmsPage>
  );
}
