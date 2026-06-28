export function getPublicEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Use direct env access so Next.js can inline these in client bundles.
  if (!supabaseUrl) {
    throw new Error("Missing required env var: NEXT_PUBLIC_SUPABASE_URL");
  }
  if (!supabaseAnonKey) {
    throw new Error("Missing required env var: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
  };
}

export function getServerEnv() {
  const publicEnv = getPublicEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Missing required env var: SUPABASE_SERVICE_ROLE_KEY");
  }
  return { ...publicEnv, serviceRoleKey };
}

export function getMailEnv() {
  const host = process.env.MAILTRAP_HOST;
  const port = process.env.MAILTRAP_PORT;
  const user = process.env.MAILTRAP_USER;
  const pass = process.env.MAILTRAP_PASS;
  const from = process.env.MAILTRAP_FROM;

  if (!host || !port || !user || !pass || !from) {
    throw new Error("Missing required Mailtrap environment variables.");
  }

  return {
    host,
    port: Number(port),
    user,
    pass,
    from,
  };
}
