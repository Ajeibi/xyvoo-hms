import * as React from "react";

/**
 * Viewports strictly below this width use the mobile nav sheet and hide desktop links.
 * Must stay in sync with header `lg:` breakpoint (1024px) in WebsiteLayout.
 */
export const MOBILE_NAV_DESKTOP_MIN_PX = 1024;

const mobileNavQuery = `(max-width: ${MOBILE_NAV_DESKTOP_MIN_PX - 1}px)`;

function getMobileNavMatches(): boolean {
  return (
    typeof window !== "undefined" &&
    window.innerWidth < MOBILE_NAV_DESKTOP_MIN_PX
  );
}

function subscribeMobileNav(onStoreChange: () => void): () => void {
  const mql = window.matchMedia(mobileNavQuery);
  const notify = () => onStoreChange();
  mql.addEventListener("change", notify);
  window.addEventListener("resize", notify);
  return () => {
    mql.removeEventListener("change", notify);
    window.removeEventListener("resize", notify);
  };
}

export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribeMobileNav,
    getMobileNavMatches,
    () => false,
  );
}
