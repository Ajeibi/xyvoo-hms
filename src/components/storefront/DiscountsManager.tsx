"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarClock, Check, Copy, Pencil, Plus, Repeat, Sparkles, Tag, Trash2 } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import {
  describeDiscount,
  discountState,
  type DiscountCode,
} from "@/lib/store/discounts";
import {
  DashAlert,
  DashCard,
  DashEmptyState,
  DashField,
  DashPill,
  DashSectionIntro,
  DashStatStrip,
  DashStatTile,
  DashStatus,
  dashButton,
  dashInput,
  sendJson,
} from "./dashboard-ui";

type Code = DiscountCode & { uses: number };
type Option = { id: string; name: string };

type FormState = {
  id: string | null;
  code: string;
  description: string;
  kind: "percent" | "fixed" | "free_delivery";
  value: string;
  scope: "all" | "some";
  productIds: string[];
  collectionIds: string[];
  minSubtotal: string;
  startsOn: string;
  endsOn: string;
  usageLimit: string;
  oncePerCustomer: boolean;
};

const EMPTY: FormState = {
  id: null,
  code: "",
  description: "",
  kind: "percent",
  value: "",
  scope: "all",
  productIds: [],
  collectionIds: [],
  minSubtotal: "",
  startsOn: "",
  endsOn: "",
  usageLimit: "",
  oncePerCustomer: false,
};

const STATE_PILL = {
  active: { tone: "green", label: "Active" },
  scheduled: { tone: "blue", label: "Starts later" },
  paused: { tone: "slate", label: "Paused" },
  ended: { tone: "slate", label: "Ended" },
  used_up: { tone: "amber", label: "Used up" },
} as const;

/** A friendly random code, e.g. "SAVE-K7Q2". Avoids letters that are easy to misread (O/0, I/1). */
function suggestCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let tail = "";
  for (let i = 0; i < 4; i += 1)
    tail += chars[Math.floor(Math.random() * chars.length)];
  return `SAVE-${tail}`;
}

/** Date inputs work in the merchant's own day: a code starts at the beginning of its first day and ends at the end of its last. */
const toIso = (day: string, end: boolean) =>
  day
    ? new Date(`${day}T${end ? "23:59:59" : "00:00:00"}`).toISOString()
    : null;
function toDay(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

export default function DiscountsManager({
  slug,
  currency,
}: {
  slug: string;
  currency: string;
}) {
  const money = (value: number) => formatShopCurrency(value, currency);
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [products, setProducts] = useState<Option[]>([]);
  const [collections, setCollections] = useState<Option[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [message, setMessage] = useState("");
  const [pickerFilter, setPickerFilter] = useState("");
  const codeRef = useRef<HTMLInputElement>(null);
  const [now] = useState(() => new Date());

  const load = () =>
    fetch(`/api/store/discounts?slug=${encodeURIComponent(slug)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok)
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "We couldn't load your discount codes.",
          );
        setCodes(data.codes ?? []);
        setCanManage(Boolean(data.canManage));
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
    fetch(`/api/store/products/list?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) =>
        setProducts(
          ((d.products ?? []) as Option[]).map((p) => ({
            id: p.id,
            name: p.name,
          })),
        ),
      )
      .catch(() => undefined);
    fetch(`/api/store/collections?slug=${encodeURIComponent(slug)}`)
      .then((r) => r.json())
      .then((d) =>
        setCollections(
          ((d.collections ?? []) as Option[]).map((c) => ({
            id: c.id,
            name: c.name,
          })),
        ),
      )
      .catch(() => undefined);
    // Load once per store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Take keyboard and screen reader users straight to the form when it opens.
  const formOpen = form !== null;
  useEffect(() => {
    if (formOpen) codeRef.current?.focus();
  }, [formOpen]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));
  const toggle = (key: "productIds" | "collectionIds", id: string) =>
    setForm((f) =>
      f
        ? {
            ...f,
            [key]: f[key].includes(id)
              ? f[key].filter((x) => x !== id)
              : [...f[key], id],
          }
        : f,
    );

  const openNew = () => {
    setMessage("");
    setFormError("");
    setPickerFilter("");
    setForm({ ...EMPTY, code: suggestCode() });
  };

  const openEdit = (c: Code) => {
    setMessage("");
    setFormError("");
    setPickerFilter("");
    setForm({
      id: c.id,
      code: c.code,
      description: c.description ?? "",
      kind: c.kind,
      value: c.kind === "free_delivery" ? "" : String(c.value),
      scope: c.productIds.length || c.collectionIds.length ? "some" : "all",
      productIds: c.productIds,
      collectionIds: c.collectionIds,
      minSubtotal: c.minSubtotal != null ? String(c.minSubtotal) : "",
      startsOn: toDay(c.startsAt),
      endsOn: toDay(c.endsAt),
      usageLimit: c.usageLimit != null ? String(c.usageLimit) : "",
      oncePerCustomer: c.perCustomerLimit === 1,
    });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    if (
      form.scope === "some" &&
      !form.productIds.length &&
      !form.collectionIds.length
    ) {
      setFormError(
        "Choose at least one product or collection, or let the code work on everything.",
      );
      return;
    }
    setSaving(true);
    setFormError("");
    const previous = form.id ? codes?.find((c) => c.id === form.id) : null;
    try {
      const body = {
        slug,
        code: form.code,
        description: form.description,
        kind: form.kind,
        value: form.kind === "free_delivery" ? null : form.value,
        productIds: form.scope === "some" ? form.productIds : [],
        collectionIds: form.scope === "some" ? form.collectionIds : [],
        minSubtotal: form.minSubtotal,
        startsAt: toIso(form.startsOn, false),
        endsAt: toIso(form.endsOn, true),
        usageLimit: form.usageLimit,
        perCustomerLimit: form.oncePerCustomer
          ? 1
          : previous?.perCustomerLimit && previous.perCustomerLimit > 1
            ? previous.perCustomerLimit
            : null,
        isActive: previous ? previous.isActive : true,
      };
      const data = form.id
        ? await sendJson(`/api/store/discounts/${form.id}`, "PATCH", body)
        : await sendJson("/api/store/discounts", "POST", body);
      setForm(null);
      await load();
      setMessage(
        form.id
          ? `Code ${data.code.code} saved.`
          : `Code ${data.code.code} is ready. Share it with your customers.`,
      );
    } catch (e) {
      setFormError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (c: Code, isActive: boolean) => {
    setBusyId(c.id);
    setError("");
    try {
      await sendJson(`/api/store/discounts/${c.id}`, "PATCH", {
        slug,
        isActive,
      });
      await load();
      setMessage(
        isActive
          ? `Code ${c.code} is switched back on.`
          : `Code ${c.code} is paused. Customers can't use it until you switch it back on.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (c: Code) => {
    if (confirmDelete !== c.id) {
      setConfirmDelete(c.id);
      return;
    }
    setBusyId(c.id);
    setError("");
    try {
      await sendJson(
        `/api/store/discounts/${c.id}?slug=${encodeURIComponent(slug)}`,
        "DELETE",
      );
      setConfirmDelete(null);
      await load();
      setMessage(
        `Code ${c.code} deleted. Orders that used it keep their discount.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 2000);
    } catch {
      setError(
        "We couldn't copy the code. You can select it and copy it yourself.",
      );
    }
  };

  const filterText = pickerFilter.trim().toLowerCase();
  const matches = (o: Option) =>
    !filterText || o.name.toLowerCase().includes(filterText);

  const usage = (c: Code) => {
    const times = c.uses === 1 ? "once" : `${c.uses} times`;
    if (c.usageLimit != null) return `${c.uses} of ${c.usageLimit} used`;
    return c.uses ? `Used ${times}` : "Not used yet";
  };
  const dates = (c: Code) => {
    if (c.startsAt && new Date(c.startsAt) > now)
      return `Starts ${longDate(c.startsAt)}${c.endsAt ? `, ends ${longDate(c.endsAt)}` : ""}`;
    if (c.endsAt)
      return `${new Date(c.endsAt) <= now ? "Ended" : "Ends"} ${longDate(c.endsAt)}`;
    return "No end date";
  };

  const states = (codes ?? []).map((c) => discountState(c, c.uses, now));
  const totalUses = (codes ?? []).reduce((n, c) => n + c.uses, 0);

  return (
    <div className="space-y-6">
      <DashSectionIntro
        id="discounts"
        meaning="marketing"
        art="tag"
        title="Run a sale with a code"
        points={[
          "Make a code like WELCOME10 for money off, a percentage off or free delivery.",
          "Choose when it starts and ends, and how many times it can be used.",
          "Share it on WhatsApp, Instagram or in person. Customers type it at checkout.",
        ]}
      />

      {codes && codes.length ? (
        <DashStatStrip label="Your codes in figures" columns={3}>
          <DashStatTile label="Working now" meaning="marketing" icon={Tag} hint="Customers can use these today" value={String(states.filter((s) => s === "active").length)} />
          <DashStatTile label="Starting later" meaning="orders" icon={CalendarClock} hint="Scheduled for a future date" value={String(states.filter((s) => s === "scheduled").length)} />
          <DashStatTile label="Times used" meaning="money" icon={Repeat} hint="Across all your codes" value={String(totalUses)} />
        </DashStatStrip>
      ) : null}

      {error ? <DashAlert message={error} /> : null}
      {message ? <DashStatus message={message} /> : null}

      {form ? (
        <DashCard
          id="discount-form"
          icon={Tag}
          title={form.id ? `Edit ${form.code || "code"}` : "New discount code"}
          description="Customers type the code at checkout. We check it there, so it can't be used outside the rules you set."
        >
          <form onSubmit={save} noValidate className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <DashField
                id="dc-code"
                label="The code customers type"
                hint="Letters and numbers, no spaces. Customers can type it in capitals or not."
              >
                <div className="flex gap-2">
                  <input
                    ref={codeRef}
                    id="dc-code"
                    className={`${dashInput} font-mono uppercase tracking-wide`}
                    value={form.code}
                    onChange={(e) =>
                      set(
                        "code",
                        e.target.value.toUpperCase().replace(/\s+/g, ""),
                      )
                    }
                    maxLength={30}
                    autoComplete="off"
                    aria-describedby="dc-code-hint"
                  />
                  <button
                    type="button"
                    onClick={() => set("code", suggestCode())}
                    className={dashButton.secondary}
                    title="Make up a code for me"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden />
                    <span className="sr-only">Make up a code for me</span>
                  </button>
                </div>
              </DashField>
              <DashField
                id="dc-note"
                label="A note for you"
                optional
                hint="Only you see this, e.g. “Instagram followers, December”."
              >
                <input
                  id="dc-note"
                  className={dashInput}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  maxLength={200}
                  aria-describedby="dc-note-hint"
                />
              </DashField>
            </div>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-slate-800">
                What customers get
              </legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["percent", "A percentage"],
                    ["fixed", `An amount (${currency})`],
                    ["free_delivery", "Free delivery"],
                  ] as const
                ).map(([kind, label]) => (
                  <label
                    key={kind}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${form.kind === kind ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-300 text-slate-700"}`}
                  >
                    <input
                      type="radio"
                      name="dc-kind"
                      checked={form.kind === kind}
                      onChange={() => set("kind", kind)}
                      className="accent-blue-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {form.kind === "free_delivery" ? (
                <p className="text-sm text-slate-600">
                  Customers pay nothing for delivery, whichever delivery option they choose. The items stay at full price.
                </p>
              ) : (
              <div className="max-w-xs">
                <label htmlFor="dc-value" className="sr-only">
                  {form.kind === "percent" ? "Percentage off" : "Amount off"}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="dc-value"
                    className={dashInput}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={form.kind === "percent" ? 100 : undefined}
                    step="any"
                    value={form.value}
                    onChange={(e) => set("value", e.target.value)}
                    placeholder={form.kind === "percent" ? "10" : "2000"}
                  />
                  <span className="shrink-0 text-sm text-slate-600">
                    {form.kind === "percent" ? "% off" : `${currency} off`}
                  </span>
                </div>
              </div>
              )}
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="text-sm font-medium text-slate-800">
                What it works on
              </legend>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["all", "Everything in my shop"],
                    ["some", "Only some products"],
                  ] as const
                ).map(([scope, label]) => (
                  <label
                    key={scope}
                    className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${form.scope === scope ? "border-blue-500 bg-blue-50 text-blue-900" : "border-slate-300 text-slate-700"}`}
                  >
                    <input
                      type="radio"
                      name="dc-scope"
                      checked={form.scope === scope}
                      onChange={() => set("scope", scope)}
                      className="accent-blue-600"
                    />
                    {label}
                  </label>
                ))}
              </div>
              {form.scope === "some" ? (
                <div className="rounded-xl border border-slate-200 p-4">
                  <label
                    htmlFor="dc-filter"
                    className="text-sm font-medium text-slate-800"
                  >
                    Find products or collections
                  </label>
                  <input
                    id="dc-filter"
                    className={`${dashInput} mt-1`}
                    value={pickerFilter}
                    onChange={(e) => setPickerFilter(e.target.value)}
                    placeholder="Start typing a name"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    {form.productIds.length + form.collectionIds.length} chosen.
                    A collection covers every product in it, including ones you
                    add later.
                  </p>
                  <div className="mt-3 grid max-h-64 gap-4 overflow-y-auto sm:grid-cols-2">
                    {[
                      {
                        key: "collectionIds" as const,
                        title: "Collections",
                        list: collections,
                      },
                      {
                        key: "productIds" as const,
                        title: "Products",
                        list: products,
                      },
                    ].map((group) => (
                      <fieldset key={group.key}>
                        <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {group.title}
                        </legend>
                        {group.list.length === 0 ? (
                          <p className="mt-1 text-sm text-slate-500">
                            None yet.
                          </p>
                        ) : (
                          <ul className="mt-1 space-y-1">
                            {group.list.filter(matches).map((o) => (
                              <li key={o.id}>
                                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                                  <input
                                    type="checkbox"
                                    checked={form[group.key].includes(o.id)}
                                    onChange={() => toggle(group.key, o.id)}
                                    className="h-4 w-4 accent-blue-600"
                                  />
                                  {o.name}
                                </label>
                              </li>
                            ))}
                          </ul>
                        )}
                      </fieldset>
                    ))}
                  </div>
                </div>
              ) : null}
            </fieldset>

            <details
              className="group rounded-xl border border-slate-200 open:bg-slate-50/50"
              open={Boolean(
                form.minSubtotal ||
                form.startsOn ||
                form.endsOn ||
                form.usageLimit ||
                form.oncePerCustomer,
              )}
            >
              <summary className="cursor-pointer list-none rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue">
                Limits and dates{" "}
                <span className="font-normal text-slate-500">
                  (optional): a minimum spend, when it runs, how many times it
                  can be used
                </span>
              </summary>
              <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
                <DashField
                  id="dc-min"
                  label="Minimum spend"
                  optional
                  hint={`Leave empty for any order. In ${currency}, before delivery.`}
                >
                  <input
                    id="dc-min"
                    className={dashInput}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="any"
                    value={form.minSubtotal}
                    onChange={(e) => set("minSubtotal", e.target.value)}
                    aria-describedby="dc-min-hint"
                  />
                </DashField>
                <DashField
                  id="dc-limit"
                  label="How many times it can be used in total"
                  optional
                  hint="Leave empty for no limit. Cancelled orders give their use back."
                >
                  <input
                    id="dc-limit"
                    className={dashInput}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={form.usageLimit}
                    onChange={(e) => set("usageLimit", e.target.value)}
                    aria-describedby="dc-limit-hint"
                  />
                </DashField>
                <DashField
                  id="dc-start"
                  label="Starts on"
                  optional
                  hint="Leave empty to start straight away."
                >
                  <input
                    id="dc-start"
                    className={dashInput}
                    type="date"
                    value={form.startsOn}
                    onChange={(e) => set("startsOn", e.target.value)}
                    aria-describedby="dc-start-hint"
                  />
                </DashField>
                <DashField
                  id="dc-end"
                  label="Last day"
                  optional
                  hint="It stops working at the end of this day. Leave empty to keep it running."
                >
                  <input
                    id="dc-end"
                    className={dashInput}
                    type="date"
                    value={form.endsOn}
                    min={form.startsOn || undefined}
                    onChange={(e) => set("endsOn", e.target.value)}
                    aria-describedby="dc-end-hint"
                  />
                </DashField>
                <label className="flex items-start gap-3 text-sm text-slate-700 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.oncePerCustomer}
                    onChange={(e) => set("oncePerCustomer", e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-blue-600"
                  />
                  <span>
                    <span className="font-medium text-slate-800">
                      One use per customer
                    </span>
                    <span className="block text-slate-500">
                      Checked against the email address they order with.
                    </span>
                  </span>
                </label>
              </div>
            </details>

            {formError ? <DashAlert message={formError} /> : null}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className={dashButton.primary}
              >
                {saving ? "Saving…" : form.id ? "Save code" : "Create code"}
              </button>
              <button
                type="button"
                onClick={() => setForm(null)}
                className={dashButton.secondary}
              >
                Cancel
              </button>
            </div>
          </form>
        </DashCard>
      ) : null}

      {!codes ? (
        error ? null : (
          <div className="space-y-3">
            <p className="sr-only" role="status">
              Loading your discount codes…
            </p>
            {[0, 1].map((i) => (
              <div
                key={i}
                aria-hidden
                className="h-24 animate-pulse rounded-2xl bg-white motion-reduce:animate-none"
              />
            ))}
          </div>
        )
      ) : codes.length === 0 && !form ? (
        <DashEmptyState
          art="tag"
          meaning="marketing"
          title="No discount codes yet"
          description="Create a code like WELCOME10 to say thank you, win back a customer or run a sale. You choose what it takes off and for how long."
          action={
            canManage ? (
              <button
                type="button"
                onClick={openNew}
                className={dashButton.primary}
              >
                <Plus className="h-4 w-4" aria-hidden /> Create your first code
              </button>
            ) : null
          }
        />
      ) : codes.length ? (
        <DashCard
          id="discount-list"
          icon={Tag}
          title="Your codes"
          description="Share a code on social media, WhatsApp or in person. Customers enter it at checkout."
          actions={
            canManage && !form ? (
              <button
                type="button"
                onClick={openNew}
                className={dashButton.primary}
              >
                <Plus className="h-4 w-4" aria-hidden /> New code
              </button>
            ) : null
          }
        >
          <ul className="divide-y divide-slate-100">
            {codes.map((c) => {
              const state = STATE_PILL[discountState(c, c.uses, now)];
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center gap-4 py-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1 font-mono text-sm font-semibold tracking-wide text-slate-900">
                        {c.code}
                      </span>
                      <button
                        type="button"
                        onClick={() => copy(c.code)}
                        className={dashButton.quiet}
                      >
                        {copied === c.code ? (
                          <Check className="h-4 w-4" aria-hidden />
                        ) : (
                          <Copy className="h-4 w-4" aria-hidden />
                        )}
                        {copied === c.code ? "Copied" : "Copy"}
                        <span className="sr-only"> code {c.code}</span>
                      </button>
                      <DashPill tone={state.tone}>{state.label}</DashPill>
                    </div>
                    <p className="mt-1.5 text-sm font-medium text-slate-800">
                      {describeDiscount(c, money)}
                    </p>
                    <p className="text-sm text-slate-500">
                      {[
                        usage(c),
                        dates(c),
                        c.perCustomerLimit === 1 ? "One per customer" : null,
                        c.description,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {confirmDelete === c.id ? (
                      <p role="alert" className="mt-2 text-sm text-red-800">
                        Delete {c.code}? Customers won&rsquo;t be able to use
                        it. Orders that already used it keep their discount.
                      </p>
                    ) : null}
                  </div>
                  {canManage ? (
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        disabled={busyId === c.id}
                        className={dashButton.quiet}
                      >
                        <Pencil className="h-4 w-4" aria-hidden /> Edit
                        <span className="sr-only"> {c.code}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActive(c, !c.isActive)}
                        disabled={busyId === c.id}
                        className={dashButton.quiet}
                      >
                        {c.isActive ? "Pause" : "Switch on"}
                        <span className="sr-only"> {c.code}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(c)}
                        disabled={busyId === c.id}
                        className={dashButton.danger}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden />{" "}
                        {confirmDelete === c.id ? "Yes, delete" : "Delete"}
                        <span className="sr-only"> {c.code}</span>
                      </button>
                      {confirmDelete === c.id ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(null)}
                          className={dashButton.quiet}
                        >
                          Keep it
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </DashCard>
      ) : null}
    </div>
  );
}
