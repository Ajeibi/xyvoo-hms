"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { FbOutletRow, FbTableRow } from "@/lib/hms/fb-types";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function FbSettingsClient({
  slug,
  initial,
}: {
  slug: string;
  initial: {
    outlets: FbOutletRow[];
    tables: FbTableRow[];
  };
}) {
  const [outlets, setOutlets] = useState<FbOutletRow[]>(initial.outlets);
  const [tables, setTables] = useState<FbTableRow[]>(initial.tables);
  const [outletId, setOutletId] = useState(initial.outlets[0]?.id ?? "");
  const [tableCode, setTableCode] = useState("");
  const [tableCovers, setTableCovers] = useState("4");

  const refreshConfig = useCallback(async () => {
    const res = await fetch(`/api/hotel/fb/config?slug=${encodeURIComponent(slug)}&seed=0`);
    const data = await res.json();
    if (res.ok) {
      setOutlets(data.outlets ?? []);
      setTables(data.tables ?? []);
      setOutletId((prev) => prev || data.outlets?.[0]?.id || "");
    }
  }, [slug]);

  const addTable = async () => {
    const res = await fetch("/api/hotel/fb/menu", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "table",
        slug,
        outletId,
        tableCode,
        covers: Number(tableCovers),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      toastError("Could not add table", data.error ?? "Try again.");
      return;
    }
    toastSuccess("Table added");
    setTableCode("");
    await refreshConfig();
  };

  const outletTables = tables.filter((t) => t.outlet_id === outletId);
  const restaurantOutlet = outlets.find((o) => o.id === outletId)?.outlet_type === "restaurant";

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-6 py-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">F&amp;B settings</h1>
        <p className="text-sm text-slate-500">Operational setup — restaurant tables.</p>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        Menu, sections, and kitchen stations are managed in{" "}
        <Link href={`/hms/${slug}/settings#menu-setup`} className="font-medium underline">
          Settings → Menu setup
        </Link>
        .
      </div>

      {outlets.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {outlets.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setOutletId(o.id)}
              className={`rounded-xl px-4 py-2 text-sm font-medium ${
                outletId === o.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {o.name}
            </button>
          ))}
        </div>
      ) : null}

      {restaurantOutlet ? (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-slate-800">Restaurant tables</h2>
          <div className="flex flex-wrap gap-2">
            <Input
              value={tableCode}
              onChange={(e) => setTableCode(e.target.value)}
              placeholder="Table code"
              className="max-w-[120px]"
            />
            <Input
              value={tableCovers}
              onChange={(e) => setTableCovers(e.target.value)}
              placeholder="Covers"
              type="number"
              className="max-w-[100px]"
            />
            <Button type="button" onClick={() => void addTable()}>
              <Plus className="mr-1 h-4 w-4" />
              Add table
            </Button>
          </div>
          <ul className="flex flex-wrap gap-2 text-sm">
            {outletTables.map((t) => (
              <li key={t.id} className="rounded-lg bg-slate-100 px-3 py-1">
                {t.table_code} ({t.covers})
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
