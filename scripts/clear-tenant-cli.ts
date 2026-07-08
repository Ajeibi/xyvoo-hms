/**
 * Wipe ALL operational hotel data for a tenant (guests, stays, F&B, room status).
 *
 * Usage (from xyvoo-next/):
 *   npm run clear:tenant -- firefly
 *   npm run clear:tenant -- firefly --then-seed
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { getHotelTenantBySlug } from "../src/lib/hms/data";
import { clearTenantFbOrders, clearTenantOperationalData } from "../src/lib/hms/seed/clear-tenant-operational";
import { seedDemoTenant } from "../src/lib/hms/seed/seed-demo-tenant";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XYVOO_NEXT = path.resolve(__dirname, "..");
const DEFAULT_SLUG = "firefly";

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
  const ordersOnly = args.includes("--orders-only");
  const thenSeed = args.includes("--then-seed");
  const tenantIdArg = args.find((a) => /^[0-9a-f-]{36}$/i.test(a));
  const slugArg = args.find((a) => !a.startsWith("--") && !/^[0-9a-f-]{36}$/i.test(a));

  const slug = slugArg ?? DEFAULT_SLUG;
  const tenant = tenantIdArg ? { id: tenantIdArg, slug } : await getHotelTenantBySlug(slug);
  if (!tenant) {
    console.error(`Tenant not found for slug "${slug}".`);
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  const result = ordersOnly
    ? await clearTenantFbOrders(supabase, tenant.id)
    : await clearTenantOperationalData(supabase, tenant.id);
  if (!result.ok) {
    console.error(`Clear failed: ${result.error}`);
    process.exit(1);
  }

  if (ordersOnly) {
    console.log(`F&B orders cleared for ${slug} (${tenant.id}). Menu and tables kept.`);
    return;
  }

  console.log(`Operational data cleared for ${slug} (${tenant.id}).`);
  console.log("  → 0 guests, 0 reservations, 0 F&B orders, all room keys vacant_clean.");
  console.log("  → F&B menu, tables, outlets, and kitchen settings kept.");

  if (thenSeed) {
    const seed = await seedDemoTenant(supabase, tenant.id, slug, { force: true });
    if (!seed.ok) {
      console.error(seed.error);
      process.exit(1);
    }
    console.log(seed.message);
  } else {
    console.log("\nTo load fresh demo data: npm run seed:demo -- firefly --force");
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
