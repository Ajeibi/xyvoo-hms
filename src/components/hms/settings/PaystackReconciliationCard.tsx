"use client";

import { useEffect, useState } from "react";
import { formatPricingAmount } from "@/lib/hms/room-pricing";

type IntentRow = {
  id: string;
  reservation_id: string | null;
  amount: number;
  currency_code: string;
  purpose: string;
  paystack_reference: string;
  status: string;
  folio_transaction_id: string | null;
  created_at: string;
};

export function PaystackReconciliationCard({ slug, currency }: { slug: string; currency: string }) {
  const [intents, setIntents] = useState<IntentRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/hotel/paystack/reconciliation?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) => setIntents(d.intents ?? []))
      .catch(() => setIntents([]))
      .finally(() => setLoading(false));
  }, [slug]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">Paystack reconciliation</h2>
      <p className="mt-1 text-sm text-slate-600">Recent Paystack payment intents for this property.</p>
      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : intents.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No Paystack transactions yet.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="py-2">Date</th>
                <th>Reference</th>
                <th>Purpose</th>
                <th>Status</th>
                <th className="text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {intents.map((row) => (
                <tr key={row.id} className="border-t border-slate-100">
                  <td className="py-2 text-slate-600">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="font-mono text-xs">{row.paystack_reference}</td>
                  <td className="capitalize">{row.purpose.replace("_", " ")}</td>
                  <td className="capitalize">{row.status}</td>
                  <td className="text-right tabular-nums">
                    {formatPricingAmount(Number(row.amount), row.currency_code || currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
