"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, Mail, MessageCircle, Phone, Search, X } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { isSale } from "@/lib/store/sales";
import { whatsappLink } from "@/lib/store/whatsapp";
import { DashAlert, DashField, dashInput, DashStatus, sendJson } from "./dashboard-ui";

type Segment = "vip" | "repeat" | "new" | "one_time" | "at_risk" | "lapsed" | "not_paid";

type Customer = {
  key: string;
  name: string;
  email: string | null;
  phone: string | null;
  orders: number;
  paidOrders: number;
  totalSpent: number;
  averageOrder: number;
  firstOrderAt: string;
  lastOrderAt: string;
  lastPaidAt: string | null;
  segment: Segment;
  tags: string[];
  note: string;
};

type SegmentInfo = { key: Segment; label: string; help: string; count: number };
type Order = { id: string; createdAt: string; status: string; paymentStatus: string; total: number; deliveryMethod: string | null; items: { name: string; quantity: number; total: number }[] };

const SEGMENT_STYLE: Record<Segment, string> = {
  vip: "bg-violet-100 text-violet-900",
  repeat: "bg-blue-100 text-blue-900",
  new: "bg-emerald-100 text-emerald-900",
  one_time: "bg-slate-100 text-slate-800",
  at_risk: "bg-amber-100 text-amber-900",
  lapsed: "bg-red-100 text-red-900",
  not_paid: "bg-slate-100 text-slate-600",
};

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

/** Dashboard → Customers: everyone who has ordered, grouped automatically, with the shop's own notes. */
export default function CustomersManager({ slug }: { slug: string }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [segments, setSegments] = useState<SegmentInfo[]>([]);
  const [currency, setCurrency] = useState("NGN");
  const [canExport, setCanExport] = useState(false);
  const [segment, setSegment] = useState<Segment | "all">("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Customer | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/store/customers?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!ok) return setError(typeof body.error === "string" ? body.error : "We couldn't load your customers.");
        setCustomers(body.customers);
        setSegments(body.segments);
        setCurrency(body.currency);
        setCanExport(Boolean(body.canExport));
      })
      .catch(() => setError("We couldn't load your customers. Please refresh the page."));
  }, [slug]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (customers ?? []).filter(
      (c) =>
        (segment === "all" || c.segment === segment) &&
        (!q || [c.name, c.email, c.phone, ...c.tags].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [customers, segment, query]);

  if (!customers) return <p className="text-sm text-slate-500">{error || "Loading…"}</p>;
  const money = (v: number) => formatShopCurrency(v, currency);
  const label = (s: Segment) => segments.find((x) => x.key === s)?.label ?? s;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Customer groups">
        <button
          type="button"
          aria-pressed={segment === "all"}
          onClick={() => setSegment("all")}
          className={`rounded-full border px-3 py-1.5 text-sm ${segment === "all" ? "border-xyvoo-blue bg-blue-50 font-semibold text-blue-800" : "border-slate-200 bg-white text-slate-700"}`}
        >
          Everyone ({customers.length})
        </button>
        {segments.map((s) => (
          <button
            key={s.key}
            type="button"
            title={s.help}
            aria-pressed={segment === s.key}
            onClick={() => setSegment(s.key)}
            className={`rounded-full border px-3 py-1.5 text-sm ${segment === s.key ? "border-xyvoo-blue bg-blue-50 font-semibold text-blue-800" : "border-slate-200 bg-white text-slate-700"}`}
          >
            {s.label} ({s.count})
          </button>
        ))}
      </div>
      {segment !== "all" ? <p className="text-sm text-slate-600">{segments.find((s) => s.key === segment)?.help}.</p> : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="relative w-full max-w-sm">
          <label htmlFor="cust-search" className="sr-only">
            Search customers
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input id="cust-search" type="search" className={`${dashInput} pl-9`} placeholder="Search by name, email, phone or tag" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {canExport ? (
          <a href={`/api/store/customers/export?slug=${encodeURIComponent(slug)}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50">
            <Download className="h-4 w-4" aria-hidden /> Export to spreadsheet (CSV)
          </a>
        ) : null}
      </div>

      <DashAlert message={error} />

      {customers.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
          Your customers will appear here after their first order.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Customers</caption>
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Customer</th>
                <th scope="col" className="px-4 py-3 font-semibold">Group</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Paid orders</th>
                <th scope="col" className="px-4 py-3 text-right font-semibold">Total spent</th>
                <th scope="col" className="px-4 py-3 font-semibold">Last order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {shown.map((c) => (
                <tr key={c.key} className="hover:bg-slate-50">
                  <th scope="row" className="px-4 py-3 font-normal">
                    <button type="button" onClick={() => setOpen(c)} className="text-left font-medium text-blue-800 hover:underline">
                      {c.name}
                    </button>
                    <span className="block text-xs text-slate-500">{c.email || c.phone}</span>
                    {c.tags.length ? <span className="mt-1 block text-xs text-slate-500">{c.tags.map((t) => `#${t}`).join(" ")}</span> : null}
                  </th>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEGMENT_STYLE[c.segment]}`}>{label(c.segment)}</span>
                  </td>
                  <td className="px-4 py-3 text-right">{c.paidOrders}</td>
                  <td className="px-4 py-3 text-right">{money(c.totalSpent)}</td>
                  <td className="px-4 py-3">{date(c.lastOrderAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No customers match.</p> : null}
        </div>
      )}

      {open ? (
        <CustomerPanel
          slug={slug}
          customer={open}
          money={money}
          segmentLabel={label(open.segment)}
          onClose={() => setOpen(null)}
          onSaved={(updated) => {
            setCustomers((list) => list?.map((c) => (c.key === updated.key ? updated : c)) ?? null);
            setOpen(updated);
          }}
        />
      ) : null}
    </div>
  );
}

function CustomerPanel({
  slug,
  customer,
  money,
  segmentLabel,
  onClose,
  onSaved,
}: {
  slug: string;
  customer: Customer;
  money: (v: number) => string;
  segmentLabel: string;
  onClose: () => void;
  onSaved: (c: Customer) => void;
}) {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [tags, setTags] = useState(customer.tags.join(", "));
  const [note, setNote] = useState(customer.note);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/store/customers?slug=${encodeURIComponent(slug)}&key=${encodeURIComponent(customer.key)}`)
      .then((r) => r.json())
      .then((body) => setOrders(body.orders ?? []))
      .catch(() => setOrders([]));
  }, [slug, customer.key]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
    try {
      await sendJson("/api/store/customers", "PATCH", { slug, key: customer.key, tags: tagList, note });
      onSaved({ ...customer, tags: [...new Set(tagList.map((t) => t.toLowerCase()))], note: note.trim() });
      setStatus("Saved.");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const digits = customer.phone?.replace(/[^0-9+]/g, "") ?? "";
  const whatsapp = whatsappLink(customer.phone, `Hello ${customer.name.split(/\s+/)[0]}, `);

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/40" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="cust-panel-title"
        className="h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="cust-panel-title" className="text-lg font-semibold text-slate-900">
              {customer.name}
            </h2>
            <p className="text-sm text-slate-600">{segmentLabel}</p>
          </div>
          <button type="button" onClick={onClose} autoFocus className="rounded-lg p-2 text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" aria-hidden />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {customer.email ? (
            <a href={`mailto:${encodeURIComponent(customer.email)}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">
              <Mail className="h-4 w-4" aria-hidden /> {customer.email}
            </a>
          ) : null}
          {digits ? (
            <>
              <a href={`tel:${digits}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 hover:bg-slate-50">
                <Phone className="h-4 w-4" aria-hidden /> {customer.phone}
              </a>
              {whatsapp ? (
                <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                  <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp <span className="sr-only">(opens WhatsApp)</span>
                </a>
              ) : null}
            </>
          ) : null}
        </div>

        <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
          {[
            ["Total spent", money(customer.totalSpent)],
            ["Paid orders", String(customer.paidOrders)],
            ["Average order", money(customer.averageOrder)],
            ["Customer since", date(customer.firstOrderAt)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-slate-50 p-3">
              <dt className="text-xs text-slate-500">{k}</dt>
              <dd className="font-semibold text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>

        <form onSubmit={save} className="mt-6 space-y-3">
          <DashField id="cust-tags" label="Tags" hint="Separate with commas, e.g. wholesale, lagos" optional>
            <input id="cust-tags" className={dashInput} value={tags} onChange={(e) => setTags(e.target.value)} aria-describedby="cust-tags-hint" />
          </DashField>
          <DashField id="cust-note" label="Private note" hint="Only your team sees this." optional>
            <textarea id="cust-note" className={`${dashInput} min-h-24`} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} aria-describedby="cust-note-hint" />
          </DashField>
          <button type="submit" disabled={busy} className="rounded-lg bg-xyvoo-blue px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Saving…" : "Save"}
          </button>
          {status ? <DashStatus message={status} /> : null}
          <DashAlert message={error} />
        </form>

        <h3 className="mt-8 text-sm font-semibold text-slate-900">Orders</h3>
        {orders === null ? (
          <p className="mt-2 text-sm text-slate-500">Loading…</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {orders.map((o) => (
              <li key={o.id} className="py-3">
                <div className="flex justify-between gap-2">
                  <span className="font-medium text-slate-900">
                    {date(o.createdAt)} · {o.id.slice(0, 8).toUpperCase()}
                  </span>
                  <span className="font-medium text-slate-900">{money(o.total)}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {o.paymentStatus === "paid" ? "Paid online" : isSale(o.paymentStatus, o.status) ? "Paid offline" : o.paymentStatus === "failed" ? "Payment failed" : "Not paid yet"} · {o.status}
                  {o.deliveryMethod ? ` · ${o.deliveryMethod}` : ""}
                </p>
                <p className="text-slate-700">{o.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}</p>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
