"use client";

import { useHotelRegisterStore } from "@/features/hotel-register/store";

export default function MissingFieldsModal() {
  const open = useHotelRegisterStore((s) => s.showMissingFieldsModal);
  const fields = useHotelRegisterStore((s) => s.missingFields);
  const close = useHotelRegisterStore((s) => s.closeMissingFieldsModal);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center px-4">
      <button type="button" aria-label="Close missing fields modal" className="absolute inset-0 bg-black/40" onClick={close} />
      <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl border border-slate-200 p-6">
        <h3 className="text-lg font-bold text-slate-900 mb-2">Incomplete registration form</h3>
        <p className="text-sm text-slate-600 mb-4">Please complete the following required fields before continuing:</p>
        <ul className="space-y-2 mb-5 max-h-64 overflow-y-auto">
          {fields.map((field) => (
            <li key={field} className="text-sm text-slate-700 flex items-start gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-red-500 flex-shrink-0" />
              <span>{field}</span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={close}
          className="w-full cursor-pointer rounded-xl bg-xyvoo-blue py-2.5 font-semibold text-white"
        >
          Okay, I will complete them
        </button>
      </div>
    </div>
  );
}
