import { cache } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";

export async function createSupabaseAuthServerClient() {
  const { supabaseUrl, supabaseAnonKey } = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });
}

/** The parts of the signed-in user that the access token carries. */
export type SessionUser = Pick<User, "id" | "email" | "user_metadata" | "app_metadata">;

/** The signed-in user, from the verified session token, once per server render.
 * A page, its layout and their helpers all ask for the user; without the cache each one
 * checked the session separately. getClaims() verifies the token itself when the project
 * uses asymmetric JWT signing keys (no request to Supabase Auth), and asks Supabase Auth
 * when it still uses the legacy shared secret.
 * Metadata comes from the token, so a change (e.g. department_role) applies at the next
 * token refresh, and a removed user stays signed in until their token expires (≤ 1 hour). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const auth = await createSupabaseAuthServerClient();
  const { data, error } = await auth.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return {
    id: claims.sub,
    email: claims.email,
    user_metadata: claims.user_metadata ?? {},
    app_metadata: claims.app_metadata ?? {},
  };
});
