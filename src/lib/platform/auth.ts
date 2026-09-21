import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isPlatformAdminEmail } from "@/lib/auth/redirects";

/**
 * API-level guard mirroring /admin and /onboard's page-level layout gate — every platform
 * route re-checks this itself rather than trusting the page wrapper, same as every hotel API
 * route re-checks tenant membership instead of trusting HMSLayout.
 */
export async function requirePlatformAdmin() {
  const auth = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();

  if (!user) return { error: "Unauthorized" as const, status: 401 as const };
  if (!isPlatformAdminEmail(user.email)) return { error: "Forbidden" as const, status: 403 as const };

  return { user, service: createServerSupabaseClient() };
}
