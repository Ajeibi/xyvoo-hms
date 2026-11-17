"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { HmsAlert, HmsCard, HmsField, hmsButton, hmsInput } from "@/components/hms/hms-ui";
import { toastError, toastSuccess } from "@/lib/app-toast";

/** Where an owner, admin or head of department sets their own PIN for approving staff actions. */
export default function ApprovalPinCard({ slug }: { slug: string }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (pin !== confirm) return setError("The two PINs don't match.");
    setSaving(true);
    const res = await fetch("/api/hotel/staff/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, pin }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Unable to save the PIN.");
      toastError("PIN not saved", data.error || "Please try again.");
      return;
    }
    setPin("");
    setConfirm("");
    toastSuccess("Approval PIN saved");
  };

  return (
    <form onSubmit={submit}>
      <HmsCard
        id="approval-pin"
        title="My approval PIN"
        description="When your staff need approval (a void, a refund, a big discount), you key in this PIN and your name goes on the record. Use 4 to 6 digits that nobody else uses."
        icon={KeyRound}
        meaning="team"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <HmsField id="approval-pin-new" label="New PIN" hint="4 to 6 digits.">
              <input id="approval-pin-new" type="password" inputMode="numeric" pattern="\d{4,6}" maxLength={6} autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} className={hmsInput} required />
            </HmsField>
            <HmsField id="approval-pin-confirm" label="Confirm PIN">
              <input id="approval-pin-confirm" type="password" inputMode="numeric" pattern="\d{4,6}" maxLength={6} autoComplete="off" value={confirm} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} className={hmsInput} required />
            </HmsField>
          </div>
          <HmsAlert message={error} />
          <button type="submit" disabled={saving} className={hmsButton.primary}>
            {saving ? "Saving…" : "Save PIN"}
          </button>
        </div>
      </HmsCard>
    </form>
  );
}
