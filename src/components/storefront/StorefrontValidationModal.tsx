"use client";

import { useEffect, useRef } from "react";
import { AlertCircle, X } from "lucide-react";

export type ValidationErrorItem = {
  field?: string;
  label?: string;
  message: string;
};

export type StorefrontValidationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  errors: ValidationErrorItem[];
  title?: string;
  description?: string;
  confirmText?: string;
};

export default function StorefrontValidationModal({
  isOpen,
  onClose,
  errors,
  title = "Incomplete Registration Details",
  description = "Please review and complete the following required fields before continuing:",
  confirmText = "Okay, I will fix them",
}: StorefrontValidationModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key and autofocus primary button
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    // Focus the acknowledge button when modal opens
    buttonRef.current?.focus();

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen || errors.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="validation-modal-title"
      aria-describedby="validation-modal-desc"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal card */}
      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 sm:p-7 text-left shadow-2xl transition-all border border-slate-100 ring-1 ring-black/5"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 ring-8 ring-rose-50/50">
              <AlertCircle className="h-6 w-6" aria-hidden="true" />
            </div>
            <div>
              <h3 id="validation-modal-title" className="text-xl font-bold text-slate-900">
                {title}
              </h3>
              <p className="text-xs font-semibold uppercase tracking-wider text-rose-600 mt-0.5">
                {errors.length} {errors.length === 1 ? "issue requires attention" : "issues require attention"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer rounded-xl p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
            aria-label="Close error modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Description */}
        <p id="validation-modal-desc" className="mt-4 text-sm text-slate-600 leading-relaxed">
          {description}
        </p>

        {/* Error list */}
        <div className="mt-4 max-h-72 overflow-y-auto pr-1 space-y-2.5">
          {errors.map((err, idx) => (
            <div
              key={`${err.field || idx}-${idx}`}
              className="flex items-start gap-3 rounded-xl border border-rose-100 bg-rose-50/70 p-3 text-sm transition-colors hover:bg-rose-50"
            >
              <span className="mt-1 flex h-2 w-2 shrink-0 rounded-full bg-rose-500" aria-hidden="true" />
              <div className="flex-1 text-slate-800">
                {err.label ? (
                  <span className="font-semibold text-slate-900">{err.label}: </span>
                ) : null}
                <span>{err.message}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Action Button */}
        <div className="mt-6">
          <button
            ref={buttonRef}
            type="button"
            onClick={onClose}
            className="w-full cursor-pointer rounded-xl bg-xyvoo-teal-product-hover py-3 px-4 font-semibold text-white shadow-md shadow-xyvoo-teal-product-hover/20 transition-all hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-xyvoo-teal-product-hover focus:ring-offset-2"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
