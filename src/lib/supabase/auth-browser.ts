"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";

const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

export const supabaseAuthBrowser = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  // Used on the storefront/HMS register and login pages. Avoid auto-refreshing
  // a stale browser session on mount, which surfaces noisy "Invalid Refresh
  // Token" console errors before the user even submits the form.
  //
  // isSingleton: false is required for autoRefreshToken to actually take
  // effect: @supabase/ssr's createBrowserClient caches ONE client instance
  // at the module level (shared across the whole app) by default, keyed
  // only by "are we in a browser", not by the options passed in. If
  // anything elsewhere on the site (e.g. src/lib/supabase/hotel-browser.ts,
  // used by the HMS realtime hooks) creates its default-options client
  // first in a given browsing session, this call would silently return
  // that cached instance instead -- discarding autoRefreshToken: false.
  isSingleton: false,
  auth: {
    autoRefreshToken: false,
  },
});
