"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";

const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

export const supabaseAuthBrowser = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  // This client is only used on the login page. Avoid auto-refreshing a stale
  // browser session on mount, which surfaces noisy refresh-token errors before
  // the user even submits the form.
  auth: {
    autoRefreshToken: false,
  },
});
