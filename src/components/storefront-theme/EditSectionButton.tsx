"use client";

/**
 * In the website editor's preview only (the shop shown inside the editor):
 * "Edit" on each section, which opens that section's settings in the editor
 * beside it. Hidden everywhere else (see .is-framed in the layout's head script).
 */
export default function EditSectionButton({ id, label }: { id: string; label: string }) {
  return (
    <button
      type="button"
      className="sf-edit-section"
      onClick={() => window.parent.postMessage({ type: "sf:edit-section", id }, window.location.origin)}
    >
      Edit {label}
    </button>
  );
}
