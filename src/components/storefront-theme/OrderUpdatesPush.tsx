"use client";

import { useEffect, useState } from "react";
import { canUsePush, currentPushSubscription, linkPush, subscribeToShopPush } from "./push-client";
import { useStorefront, useT } from "./StorefrontProvider";

type State = "checking" | "offer" | "working" | "on" | "blocked" | "failed" | "none";

/**
 * On the order's confirmation page: "Get updates about this order on this
 * device". A device that already has the shop's notifications is signed up for
 * this order's updates straight away (and told so); others get a button.
 */
export default function OrderUpdatesPush({ orderId }: { orderId: string }) {
  const { slug, push } = useStorefront();
  const t = useT();
  const [state, setState] = useState<State>("checking");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!canUsePush(push)) return setState("none");
      const sub = await currentPushSubscription(push);
      if (cancelled) return;
      if (!sub) return setState(Notification.permission === "denied" ? "none" : "offer");
      setState((await linkPush(slug, { kind: "order", endpoint: sub.endpoint, orderId })) ? "on" : "none");
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, push, orderId]);

  const turnOn = async () => {
    if (!push) return;
    setState("working");
    const sub = await subscribeToShopPush(slug, push, false);
    if (typeof sub === "string") return setState(sub);
    setState((await linkPush(slug, { kind: "order", endpoint: sub.endpoint, orderId })) ? "on" : "failed");
  };

  if (state === "checking" || state === "none") return null;
  return (
    <div className="order-push">
      {state === "on" ? (
        <p role="status">{t("checkout.pushOn")}</p>
      ) : (
        <>
          <p>{t("checkout.pushOffer")}</p>
          <button type="button" className="btn btn--outline btn--sm" onClick={turnOn} disabled={state === "working"}>
            {state === "working" ? t("checkout.turningOn") : t("checkout.getUpdatesHere")}
          </button>
          <p className="form-status" role="status">
            {state === "blocked" ? t("checkout.pushBlocked") : state === "failed" ? t("checkout.pushFailed") : ""}
          </p>
        </>
      )}
    </div>
  );
}
