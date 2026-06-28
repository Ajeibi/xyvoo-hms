"use client";

import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

const { supabaseUrl, supabaseAnonKey } = getPublicEnv();

export const supabaseBrowser = createClient(supabaseUrl, supabaseAnonKey);
