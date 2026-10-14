"use client";

import { useCallback, useEffect, useRef } from "react";
import { AlertCircle, X } from "lucide-react";
import { MISSING_FIELD_INFO } from "@/features/hotel-register/constants";
import { useHotelRegisterStore } from "@/features/hotel-register/store";

/** The storefront's validation modal, in the hotel blue. Closing it moves focus to the first missing field. */
export default function MissingFieldsModal() {
  const open = useHotelRegisterStore((s) => s.showMissingFieldsModal);
  const fields = useHotelRegisterStore((s) => s.missingFields);
  const closeModal = useHotelRegisterStore((s) => s.closeMissingFieldsModal);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    closeModal();
    const firstId = fields.map((f) => MISSING_FIELD_INFO[f]?.id).find(Boolean);
    if (!firstId) return;
    setTimeout(() => {
      const el = document.getElementById(firstId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }, 120);
  }, [closeModal, fields]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKeyDown);
    buttonRef.current?.focus();
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, close]);

  if (!open || fields.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="missing-fields-modal-title"
      aria-describedby="missing-fields-modal-desc"
    >
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={close} aria-hidden="true" />

      <div className="relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border border-slate-100 bg-white p-6 text-left shadow-2xl ring-1 ring-black/5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-8 ring-rose-50/50">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h2 id="missing-fields-modal-title" className="text-xl font-bold text-slate-900">
                Incomplete registration form
              </h2>
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wider text-rose-700">
                {fields.length} {fields.length === 1 ? "issue requires attention" : "issues require attention"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue"
            aria-label="Close"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <p id="missing-fields-modal-desc" className="mt-4 text-sm leading-relaxed text-slate-700">
          Please complete the following required fields before continuing:
        </p>

        <ul className="mt-4 max-h-72 space-y-2.5 overflow-y-auto pr-1">
          {fields.map((field) => {
            const info = MISSING_FIELD_INFO[field];
            return (
              <li key={field} className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50/70 p-3 text-sm">
                <span className="mt-1.5 flex h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-hidden="true" />
                <span className="flex-1 text-slate-800">
                  <span className="font-semibold text-slate-900">{info?.label ?? field}: </span>
                  {info?.message ?? "This field is required."}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-6">
          <button
            ref={buttonRef}
            type="button"
            onClick={close}
            className="w-full cursor-pointer rounded-xl bg-xyvoo-blue-deep px-4 py-3 font-semibold text-white shadow-md shadow-xyvoo-blue/20 transition-all hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-xyvoo-blue focus:ring-offset-2"
          >
            Okay, I will complete them
          </button>
        </div>
      </div>
    </div>
  );
}
