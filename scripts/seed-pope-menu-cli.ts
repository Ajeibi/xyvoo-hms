/**
 * Load Pope John Paul II menu (Menu 1 = bar, Menu 2 = restaurant).
 *
 * Usage:
 *   npm run seed:menu -- firefly
 *   npm run seed:menu -- firefly --replace
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { getHotelTenantBySlug } from "../src/lib/hms/data";
import { seedPopeMenu } from "../src/lib/hms/seed/seed-pope-menu";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XYVOO_NEXT = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const p = path.join(XYVOO_NEXT, ".env.local");
  if (!fs.existsSync(p)) return;
  const text = fs.readFileSync(p, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local");
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const replace = args.includes("--replace");
  const slugArg = args.find((a) => !a.startsWith("--"));
  const slug = slugArg ?? "firefly";

  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) {
    console.error(`Tenant not found for slug "${slug}".`);
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const result = await seedPopeMenu(supabase, tenant.id, { replace });
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  console.log(result.message);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
