"use client";

import { useState } from "react";
import { hmsButton } from "@/components/hms/hms-ui";

/** The public page a guest reaches from the link in a hotel message: one button to stop marketing messages. */
export function UnsubscribeForm({ token }: { token: string }) {
  const [state, setState] = useState<"ask" | "busy" | "done" | "error">("ask");

  const submit = async () => {
    setState("busy");
    try {
      const res = await fetch("/api/hotel/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="font-heading text-xl font-semibold text-slate-900">
        {state === "done" ? "You won't get marketing messages" : "Stop marketing messages?"}
      </h1>
      {state === "done" ? (
        <p role="status" className="mt-3 text-sm text-slate-700">
          We have turned off offers and news by email, SMS and WhatsApp. You will still get messages about a stay you have booked.
        </p>
      ) : (
        <>
          <p className="mt-3 text-sm text-slate-700">
            Press the button and the hotel will stop sending you offers and news by email, SMS and WhatsApp. Messages about a stay you have booked
            will still reach you.
          </p>
          {state === "error" ? (
            <p role="alert" className="mt-3 text-sm text-red-700">
              This link isn&apos;t valid any more. Reply to the message you got and ask the hotel to take you off the list.
            </p>
          ) : null}
          <button type="button" className={`${hmsButton.primary} mt-5`} onClick={submit} disabled={state === "busy"}>
            {state === "busy" ? "Please wait…" : "Stop marketing messages"}
          </button>
        </>
      )}
    </div>
  );
}
