"use client";

import { useState } from "react";
import { Layers } from "lucide-react";
import { courseLabel, defaultCourseFor, FB_COURSES } from "@/lib/hms/fb-course-rules";
import type { FbMenuCategoryRow, FbOutletRow } from "@/lib/hms/fb-types";
import { toastError, toastSuccess } from "@/lib/app-toast";
import { useFbRealtime } from "@/hooks/useFbRealtime";
import { HmsCard, hmsInput } from "@/components/hms/hms-ui";
import { cn } from "@/lib/utils";

/**
 * Which course each menu category starts on. Staff can still move a single
 * line to another course on the POS.
 */
export function FbCourseSetup({
  slug,
  tenantId,
  outlets: initialOutlets,
  categories: initialCategories,
}: {
  slug: string;
  tenantId: string;
  outlets: FbOutletRow[];
  categories: FbMenuCategoryRow[];
}) {
  const [outlets, setOutlets] = useState(initialOutlets);
  const [categories, setCategories] = useState(initialCategories);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Categories added or renamed in the menu editor show up without a reload.
  useFbRealtime(tenantId, {
    onMenuChange: () => {
      void fetch(`/api/hotel/fb/config?slug=${encodeURIComponent(slug)}&seed=0`)
        .then((res) => (res.ok ? res.json() : null))
        .then((cfg) => {
          if (!cfg) return;
          setOutlets(cfg.outlets ?? []);
          setCategories(cfg.categories ?? []);
        });
    },
  });

  const save = async (category: FbMenuCategoryRow, value: string) => {
    const defaultCourse = value === "" ? null : Number(value);
    const previous = category.default_course;
    setCategories((list) => list.map((c) => (c.id === category.id ? { ...c, default_course: defaultCourse } : c)));
    setSavingId(category.id);
    try {
      const res = await fetch("/api/hotel/fb/category-courses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, categoryId: category.id, defaultCourse }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCategories((list) => list.map((c) => (c.id === category.id ? { ...c, default_course: previous } : c)));
        toastError("Could not save", data.error ?? "Try again.");
        return;
      }
      toastSuccess("Course saved", `${category.name}: ${defaultCourse == null ? "default" : courseLabel(defaultCourse)}`);
    } finally {
      setSavingId(null);
    }
  };

  const groups = outlets
    .map((outlet) => ({ outlet, cats: categories.filter((c) => c.outlet_id === outlet.id && c.is_active) }))
    .filter((g) => g.cats.length > 0);

  return (
    <HmsCard
      id="menu-courses"
      icon={Layers}
      meaning="food"
      title="Courses"
      description="Which course each category starts on. On send, straight-away items and the first course go to the kitchen; later courses wait until staff fire them from Open orders."
      className="mt-6 scroll-mt-24"
    >
      {groups.length === 0 ? (
        <p className="text-sm text-slate-600">Add menu categories above first.</p>
      ) : (
        <div className="space-y-5">
          {groups.map(({ outlet, cats }) => {
            const fallback = courseLabel(defaultCourseFor(null, outlet.outlet_type));
            return (
              <div key={outlet.id}>
                {groups.length > 1 ? (
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{outlet.name}</p>
                ) : null}
                <ul className="grid gap-2 sm:grid-cols-2">
                  {cats.map((cat) => {
                    const id = `course-${cat.id}`;
                    return (
                      <li key={cat.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                        <label htmlFor={id} className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                          {cat.name}
                        </label>
                        <select
                          id={id}
                          value={cat.default_course ?? ""}
                          disabled={savingId === cat.id}
                          onChange={(e) => void save(cat, e.target.value)}
                          className={cn(hmsInput, "w-44 shrink-0")}
                        >
                          <option value="">Default ({fallback})</option>
                          {FB_COURSES.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </HmsCard>
  );
}
