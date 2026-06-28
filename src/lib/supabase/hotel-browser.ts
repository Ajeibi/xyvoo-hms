"use client";

import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";

const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

export function createHotelBrowserClient() {
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
