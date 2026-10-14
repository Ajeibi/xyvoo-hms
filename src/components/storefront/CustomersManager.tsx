"use client";

import { useEffect, useMemo, useState } from "react";
import { Banknote, Download, Heart, Mail, MessageCircle, Pencil, Phone, Plus, Search, SearchX, Sparkles, Users, X } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { isSale } from "@/lib/store/sales";
import { describeRule, inGroup, type CustomerGroup } from "@/lib/store/customer-groups";
import { whatsappLink } from "@/lib/store/whatsapp";
import CustomerGroupForm from "./CustomerGroupForm";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashField, dashInput, DashPill, DashSectionIntro, DashStatStrip, DashStatTile, DashStatus, sendJson } from "./dashboard-ui";
import { MEANING } from "./meaning";

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

const SEGMENT_TONE: Record<Segment, "slate" | "green" | "amber" | "red" | "blue"> = {
  vip: "blue",
  repeat: "blue",
  new: "green",
  one_time: "slate",
  at_risk: "amber",
  lapsed: "red",
  not_paid: "slate",
};

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";
const pulse = "animate-pulse rounded bg-slate-100 motion-reduce:animate-none";
/** The WhatsApp brand green, dark enough for white text to pass contrast. */
const whatsappButton =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-800";

const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

function CustomersSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className={`h-9 w-24 rounded-full ${pulse}`} />
        ))}
      </div>
      <div className={`h-11 w-full max-w-sm rounded-xl ${pulse}`} />
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 py-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className={`h-4 w-40 max-w-full ${pulse}`} />
              <div className={`h-3 w-56 max-w-full ${pulse}`} />
            </div>
            <div className={`h-5 w-16 rounded-full ${pulse}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Dashboard → Customers: everyone who has ordered, grouped automatically, with the shop's own notes. */
export default function CustomersManager({ slug }: { slug: string }) {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [segments, setSegments] = useState<SegmentInfo[]>([]);
  const [currency, setCurrency] = useState("NGN");
  const [canExport, setCanExport] = useState(false);
  const [segment, setSegment] = useState<Segment | "all">("all");
  const [groups, setGroups] = useState<CustomerGroup[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [canManageGroups, setCanManageGroups] = useState(false);
  // "new" while making a group, a group id while changing one.
  const [editing, setEditing] = useState<string | null>(null);
  const [groupMessage, setGroupMessage] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Customer | null>(null);
  const [error, setError] = useState("");
  // Read once, so "new this month" doesn't shift between renders.
  const [monthAgo] = useState(() => Date.now() - 30 * 24 * 60 * 60 * 1000);

  useEffect(() => {
    fetch(`/api/store/customers?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!ok) return setError(typeof body.error === "string" ? body.error : "We couldn't load your customers.");
        setCustomers(body.customers);
        setSegments(body.segments);
        setCurrency(body.currency);
        setCanExport(Boolean(body.canExport));
        setGroups(body.groups ?? []);
        setCanManageGroups(Boolean(body.canManageGroups));
        setNow(Date.now());
      })
      .catch(() => setError("We couldn't load your customers. Please refresh the page."));
  }, [slug]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const group = groupId ? groups.find((g) => g.id === groupId) : null;
    return (customers ?? []).filter(
      (c) =>
        (segment === "all" || c.segment === segment) &&
        (!group || inGroup(group, c, now)) &&
        (!q || [c.name, c.email, c.phone, ...c.tags].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [customers, segment, query, groups, groupId, now]);

  if (!customers) {
    return error ? (
      <DashAlert message={error} />
    ) : (
      <>
        <p className="sr-only" role="status">
          Loading your customers
        </p>
        <CustomersSkeleton />
      </>
    );
  }
  const money = (v: number) => formatShopCurrency(v, currency);
  const label = (s: Segment) => segments.find((x) => x.key === s)?.label ?? s;
  const chip = (active: boolean) =>
    `rounded-full border px-3.5 py-1.5 text-sm font-medium ${focusRing} ${active ? `${MEANING.customers.chipOn} font-semibold` : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;

  if (customers.length === 0) {
    return (
      <div className="space-y-6">
        <DashAlert message={error} />
        <DashEmptyState
          art="people"
          meaning="customers"
          title="No customers yet"
          description="Everyone who orders from your shop will appear here after their first order, grouped automatically so you know who to thank and who to win back."
        />
      </div>
    );
  }

  const segmentHelp = segment !== "all" ? segments.find((s) => s.key === segment)?.help : null;
  const activeGroup = groupId ? groups.find((g) => g.id === groupId) ?? null : null;
  const groupCount = (g: CustomerGroup) => customers.filter((c) => inGroup(g, c, now)).length;
  const groupChip = (active: boolean) => chip(active);
  const newThisMonth = customers.filter((c) => new Date(c.firstOrderAt).getTime() >= monthAgo).length;
  const comeBack = customers.filter((c) => c.paidOrders > 1).length;
  const spent = customers.reduce((total, c) => total + c.totalSpent, 0);

  return (
    <div className="space-y-6">
      <DashSectionIntro
        id="customers"
        meaning="customers"
        art="people"
        title="Get to know your customers"
        points={[
          "Everyone who orders is added here and sorted into groups, such as new, regulars and people you haven't seen in a while.",
          "Open a customer to see what they bought, and message them on WhatsApp, by email or by phone.",
          "Add tags and a private note so you remember the little things.",
        ]}
      />

      <DashStatStrip label="Your customers in figures">
        <DashStatTile label="Customers" meaning="customers" icon={Users} hint="Everyone who has ordered" value={String(customers.length)} />
        <DashStatTile label="New this month" meaning="customers" icon={Sparkles} hint="First order in the last 30 days" value={String(newThisMonth)} />
        <DashStatTile label="Came back" meaning="orders" icon={Heart} hint="Paid for more than one order" value={String(comeBack)} />
        <DashStatTile
          label="Spent with you"
          meaning="money"
          icon={Banknote}
          hint={customers.length ? `About ${money(spent / customers.length)} each` : "Paid orders"}
          value={money(spent)}
        />
      </DashStatStrip>

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Customer groups">
          <button type="button" aria-pressed={segment === "all" && !groupId} onClick={() => { setSegment("all"); setGroupId(null); }} className={chip(segment === "all" && !groupId)}>
            Everyone ({customers.length})
          </button>
          {segments.map((s) => (
            <button key={s.key} type="button" title={s.help} aria-pressed={segment === s.key && !groupId} onClick={() => { setSegment(s.key); setGroupId(null); }} className={chip(segment === s.key && !groupId)}>
              {s.label} ({s.count})
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Your own groups">
          {groups.map((g) => (
            <button key={g.id} type="button" aria-pressed={groupId === g.id} onClick={() => { setGroupId(g.id); setSegment("all"); setGroupMessage(""); }} className={groupChip(groupId === g.id)}>
              {g.name} ({groupCount(g)})
            </button>
          ))}
          {canManageGroups ? (
            <button type="button" onClick={() => { setEditing("new"); setGroupMessage(""); }} className={`${dashButton.secondary} ${focusRing}`}>
              <Plus className="h-4 w-4" aria-hidden /> {groups.length ? "New group" : "Make your own group"}
            </button>
          ) : null}
        </div>
        {activeGroup ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600" aria-live="polite">
            <p>
              {activeGroup.rules.map((r) => describeRule(r, money)).join(activeGroup.match === "all" ? " and " : " or ")}.
            </p>
            {canManageGroups ? (
              <button type="button" onClick={() => setEditing(activeGroup.id)} className={`${dashButton.quiet} ${focusRing}`}>
                <Pencil className="h-4 w-4" aria-hidden /> Change group
              </button>
            ) : null}
          </div>
        ) : null}
        <DashStatus message={groupMessage} />
        {segmentHelp && !groupId ? (
          <p className="text-sm text-slate-600" aria-live="polite">
            {segmentHelp}.
          </p>
        ) : null}
      </div>

      <DashAlert message={error} />

      {editing ? (
        <CustomerGroupForm
          key={editing}
          slug={slug}
          group={editing === "new" ? null : groups.find((g) => g.id === editing) ?? null}
          customers={customers}
          onCancel={() => setEditing(null)}
          onSaved={(saved) => {
            setGroups((list) => (list.some((g) => g.id === saved.id) ? list.map((g) => (g.id === saved.id ? saved : g)) : [...list, saved]));
            setGroupId(saved.id);
            setSegment("all");
            setEditing(null);
            setGroupMessage(`Group “${saved.name}” saved.`);
          }}
          onDeleted={(id) => {
            setGroups((list) => list.filter((g) => g.id !== id));
            setGroupId((current) => (current === id ? null : current));
            setEditing(null);
            setGroupMessage("Group removed.");
          }}
        />
      ) : null}

      <DashCard
        id="customers-list"
        icon={Users}
        title="Your customers"
        description="Open a customer to see their orders, get in touch, or add tags and a private note."
        actions={
          canExport ? (
            <a href={`/api/store/customers/export?slug=${encodeURIComponent(slug)}`} className={`${dashButton.secondary} ${focusRing}`}>
              <Download className="h-4 w-4" aria-hidden /> Export to spreadsheet (CSV)
            </a>
          ) : null
        }
      >
        <div className="relative mb-4 w-full max-w-sm">
          <label htmlFor="cust-search" className="sr-only">
            Search customers
          </label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input id="cust-search" type="search" className={`${dashInput} pl-9`} placeholder="Search by name, email, phone or tag" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>

        <p className="sr-only" role="status">
          {shown.length} {shown.length === 1 ? "customer" : "customers"} shown
        </p>

        {shown.length === 0 ? (
          <DashEmptyState icon={SearchX} title="No customers match" description="Try a different name, email, phone number or tag, or choose “Everyone” to see all your customers." />
        ) : (
          <>
            {/* Phones: one card per customer. */}
            <ul className="divide-y divide-slate-100 sm:hidden" aria-label="Customers">
              {shown.map((c) => (
                <li key={c.key} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <button type="button" onClick={() => setOpen(c)} className={`break-words rounded text-left font-medium text-blue-800 hover:underline ${focusRing}`}>
                        {c.name}
                      </button>
                      <p className="break-words text-xs text-slate-500">{c.email || c.phone}</p>
                    </div>
                    <DashPill tone={SEGMENT_TONE[c.segment]}>{label(c.segment)}</DashPill>
                  </div>
                  <p className="mt-1 text-sm text-slate-700">
                    {money(c.totalSpent)} · {c.paidOrders} paid {c.paidOrders === 1 ? "order" : "orders"} · last ordered {date(c.lastOrderAt)}
                  </p>
                  {c.tags.length ? <p className="mt-1 break-words text-xs text-slate-500">{c.tags.map((t) => `#${t}`).join(" ")}</p> : null}
                </li>
              ))}
            </ul>

            {/* Larger screens: a table, scrolling inside the card if it needs to. */}
            <div className="-mx-5 hidden overflow-x-auto px-5 sm:-mx-6 sm:block sm:px-6">
              <table className="w-full min-w-[36rem] text-left text-sm">
                <caption className="sr-only">Customers. Select a name to see their orders and notes.</caption>
                <thead className="border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th scope="col" className="py-3 pr-4 font-semibold">Customer</th>
                    <th scope="col" className="py-3 pr-4 font-semibold">Group</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">Paid orders</th>
                    <th scope="col" className="py-3 pr-4 text-right font-semibold">Total spent</th>
                    <th scope="col" className="py-3 font-semibold">Last order</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shown.map((c) => (
                    <tr key={c.key} className="hover:bg-slate-50">
                      <th scope="row" className="py-3 pr-4 font-normal">
                        <button type="button" onClick={() => setOpen(c)} className={`rounded text-left font-medium text-blue-800 hover:underline ${focusRing}`}>
                          {c.name}
                        </button>
                        <span className="block text-xs text-slate-500">{c.email || c.phone}</span>
                        {c.tags.length ? <span className="mt-1 block text-xs text-slate-500">{c.tags.map((t) => `#${t}`).join(" ")}</span> : null}
                      </th>
                      <td className="py-3 pr-4">
                        <DashPill tone={SEGMENT_TONE[c.segment]}>{label(c.segment)}</DashPill>
                      </td>
                      <td className="py-3 pr-4 text-right text-slate-700">{c.paidOrders}</td>
                      <td className="py-3 pr-4 text-right font-medium text-slate-900">{money(c.totalSpent)}</td>
                      <td className="py-3 text-slate-700">{date(c.lastOrderAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </DashCard>

      {open ? (
        <CustomerPanel
          slug={slug}
          customer={open}
          money={money}
          segmentLabel={label(open.segment)}
          segmentTone={SEGMENT_TONE[open.segment]}
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
  segmentTone,
  onClose,
  onSaved,
}: {
  slug: string;
  customer: Customer;
  money: (v: number) => string;
  segmentLabel: string;
  segmentTone: "slate" | "green" | "amber" | "red" | "blue";
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
        className="h-full w-full max-w-lg overflow-y-auto bg-white p-5 shadow-xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="cust-panel-title" className="break-words text-xl font-semibold tracking-tight text-slate-900">
              {customer.name}
            </h2>
            <p className="mt-1">
              <DashPill tone={segmentTone}>{segmentLabel}</DashPill>
            </p>
          </div>
          <button type="button" onClick={onClose} autoFocus className={`rounded-lg p-2 text-slate-600 hover:bg-slate-100 ${focusRing}`}>
            <X className="h-5 w-5" aria-hidden />
            <span className="sr-only">Close</span>
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {digits && whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noreferrer" className={`${whatsappButton} ${focusRing}`}>
              <MessageCircle className="h-4 w-4" aria-hidden /> WhatsApp <span className="sr-only">(opens WhatsApp)</span>
            </a>
          ) : null}
          {digits ? (
            <a href={`tel:${digits}`} className={`${dashButton.secondary} ${focusRing}`}>
              <Phone className="h-4 w-4" aria-hidden /> {customer.phone}
            </a>
          ) : null}
          {customer.email ? (
            <a href={`mailto:${encodeURIComponent(customer.email)}`} className={`${dashButton.secondary} max-w-full break-all ${focusRing}`}>
              <Mail className="h-4 w-4 shrink-0" aria-hidden /> {customer.email}
            </a>
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
              <dt className="text-xs text-slate-600">{k}</dt>
              <dd className="font-semibold text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>

        <form onSubmit={save} className="mt-6 space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Your notes</h3>
          <DashField id="cust-tags" label="Tags" hint="Separate with commas, e.g. wholesale, lagos" optional>
            <input id="cust-tags" className={dashInput} value={tags} onChange={(e) => setTags(e.target.value)} aria-describedby="cust-tags-hint" />
          </DashField>
          <DashField id="cust-note" label="Private note" hint="Only your team sees this." optional>
            <textarea id="cust-note" className={`${dashInput} min-h-24`} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} aria-describedby="cust-note-hint" />
          </DashField>
          <button type="submit" disabled={busy} className={`${dashButton.primary} ${focusRing}`}>
            {busy ? "Saving…" : "Save"}
          </button>
          {status ? <DashStatus message={status} /> : null}
          <DashAlert message={error} />
        </form>

        <h3 className="mt-8 text-sm font-semibold text-slate-900">Orders</h3>
        {orders === null ? (
          <div className="mt-2 space-y-3" aria-hidden>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="space-y-2 py-2">
                <div className={`h-4 w-48 max-w-full ${pulse}`} />
                <div className={`h-3 w-64 max-w-full ${pulse}`} />
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No orders to show for this customer.</p>
        ) : (
          <ul className="mt-2 divide-y divide-slate-100 text-sm">
            {orders.map((o) => {
              const paid = o.paymentStatus === "refunded" ? "Refunded" : o.paymentStatus === "paid" ? "Paid online" : isSale(o.paymentStatus, o.status) ? "Paid offline" : o.paymentStatus === "failed" ? "Payment failed" : "Not paid yet";
              const tone = o.paymentStatus === "failed" ? "red" : paid.startsWith("Paid") ? "green" : "amber";
              return (
                <li key={o.id} className="py-3">
                  <div className="flex justify-between gap-2">
                    <span className="font-medium text-slate-900">
                      {date(o.createdAt)} · {o.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className="shrink-0 font-medium text-slate-900">{money(o.total)}</span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                    <DashPill tone={tone}>{paid}</DashPill>
                    <DashPill>{o.status}</DashPill>
                    {o.deliveryMethod ? <span>{o.deliveryMethod}</span> : null}
                  </p>
                  <p className="mt-1 text-slate-700">{o.items.map((i) => `${i.quantity} × ${i.name}`).join(", ")}</p>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
    </div>
  );
}
