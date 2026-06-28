"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { GuestMenuAccordion } from "@/components/menu/GuestMenuAccordion";
import { GuestMenuFilters } from "@/components/menu/GuestMenuFilters";
import type { PublicMenuPagePayload } from "@/lib/hms/load-fb-pages";

export function GuestMenuClient({
  slug,
  initial,
}: {
  slug: string;
  initial: PublicMenuPagePayload | null;
}) {
  const [selectedOutlet, setSelectedOutlet] = useState("all");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [sortOrder, setSortOrder] = useState("default");

  const outletOptions = useMemo(
    () =>
      (initial?.outlets ?? [])
        .filter((o) => o.categories.length > 0)
        .map((o) => ({ id: o.id, name: o.name })),
    [initial],
  );

  const categoryOptions = useMemo(() => {
    const outlets =
      selectedOutlet === "all"
        ? (initial?.outlets ?? []).filter((o) => o.categories.length > 0)
        : (initial?.outlets ?? []).filter((o) => o.id === selectedOutlet);
    const seen = new Map<string, string>();
    for (const o of outlets) {
      for (const c of o.categories) {
        seen.set(c.id, c.name);
      }
    }
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [initial, selectedOutlet]);

  const filteredCategories = useMemo(() => {
    if (!initial) return [];
    let outlets =
      selectedOutlet === "all"
        ? initial.outlets.filter((o) => o.categories.length > 0)
        : initial.outlets.filter((o) => o.id === selectedOutlet);

    let categories = outlets.flatMap((o) =>
      o.categories.map((c) => ({ ...c, outletName: o.name })),
    );

    if (selectedCategory !== "all") {
      categories = categories.filter((c) => c.id === selectedCategory);
    }

    if (sortOrder !== "default") {
      categories = categories.map((c) => ({
        ...c,
        items: [...c.items].sort((a, b) =>
          sortOrder === "low-to-high" ? a.price - b.price : b.price - a.price,
        ),
      }));
    }

    return categories;
  }, [initial, selectedOutlet, selectedCategory, sortOrder]);

  const hasMenu = (initial?.outlets ?? []).some((o) => o.categories.length > 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-4 py-10 text-center">
        <div className="mx-auto max-w-3xl">
          {initial?.hotel.logoUrl ? (
            <div className="relative mx-auto mb-4 h-16 w-16">
              <Image
                src={initial.hotel.logoUrl}
                alt=""
                fill
                className="rounded-xl object-contain"
                unoptimized
              />
            </div>
          ) : null}
          <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">
            {initial?.hotel.name ?? slug}
          </h1>
          <p className="mt-2 text-lg text-slate-500">Menu</p>
        </div>
      </header>

      {hasMenu ? (
        <div className="py-8">
          <GuestMenuFilters
            outlets={outletOptions}
            categories={categoryOptions}
            selectedOutlet={selectedOutlet}
            onOutletChange={(v) => {
              setSelectedOutlet(v);
              setSelectedCategory("all");
            }}
            selectedCategory={selectedCategory}
            onCategoryChange={setSelectedCategory}
            sortOrder={sortOrder}
            onSortOrderChange={setSortOrder}
          />
        </div>
      ) : null}

      <main className="px-4 pb-16">
        {!initial ? (
          <p className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
            Hotel not found.
          </p>
        ) : !hasMenu ? (
          <p className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
            Menu not published yet. Check back soon.
          </p>
        ) : (
          <div className="mx-auto max-w-3xl">
            <GuestMenuAccordion
              categories={filteredCategories}
              currency={initial.hotel.currency ?? "NGN"}
            />
          </div>
        )}
      </main>

      <footer className="border-t border-slate-200 py-6 text-center text-sm text-slate-400">
        Powered by XYVOO HMS
      </footer>
    </div>
  );
}
