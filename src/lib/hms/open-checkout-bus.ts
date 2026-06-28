export type OpenCheckoutDetail = {
  roomCode?: string;
  reservationId?: string;
};

export const OPEN_CHECKOUT_EVENT = "hms:open-checkout";

export function openCheckoutDialog(detail?: OpenCheckoutDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_CHECKOUT_EVENT, { detail: detail ?? {} }));
}
