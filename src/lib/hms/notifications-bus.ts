export const REFRESH_NOTIFICATIONS_EVENT = "hms-refresh-notifications";

export function requestNotificationsRefresh() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(REFRESH_NOTIFICATIONS_EVENT));
  }
}
