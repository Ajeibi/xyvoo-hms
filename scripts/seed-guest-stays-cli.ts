/**
 * Load guest/reservation fixtures from JSON files.
 *
 * Usage:
 *   npm run seed:guests -- firefly
 *   npm run seed:guests -- firefly --file src/lib/hms/seed/samples/guest-stays/checked-in.json
 *   npm run seed:guests -- firefly --append
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import { getHotelTenantBySlug } from "../src/lib/hms/data";
import {
  mergeGuestStayFixtures,
  seedGuestStaysFromFixture,
} from "../src/lib/hms/seed/seed-guest-stays";
import type { GuestStaysSampleFile } from "../src/lib/hms/seed/samples/guest-stays-sample.types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const XYVOO_NEXT = path.resolve(__dirname, "..");
const DEFAULT_FIXTURE_DIR = path.join(XYVOO_NEXT, "src/lib/hms/seed/samples/guest-stays");

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

function loadFixtureFile(filePath: string): GuestStaysSampleFile {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as GuestStaysSampleFile;
}

function resolveFixturePaths(args: string[]): string[] {
  const fileFlagIdx = args.indexOf("--file");
  if (fileFlagIdx !== -1) {
    const p = args[fileFlagIdx + 1];
    if (!p) throw new Error("--file requires a path.");
    return [path.isAbsolute(p) ? p : path.join(XYVOO_NEXT, p)];
  }

  if (!fs.existsSync(DEFAULT_FIXTURE_DIR)) return [];
  return fs
    .readdirSync(DEFAULT_FIXTURE_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => path.join(DEFAULT_FIXTURE_DIR, f));
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
  const append = args.includes("--append");
  const slug = args.find((a) => !a.startsWith("--") && a !== args[args.indexOf("--file") + 1]) ?? "firefly";

  const fixturePaths = resolveFixturePaths(args);
  if (!fixturePaths.length) {
    console.error(`No fixture files found. Add JSON under ${DEFAULT_FIXTURE_DIR} or pass --file.`);
    process.exit(1);
  }

  const tenant = await getHotelTenantBySlug(slug);
  if (!tenant) {
    console.error(`Tenant not found for slug "${slug}".`);
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  if (!append) {
    const { clearTenantOperationalData } = await import("../src/lib/hms/seed/clear-tenant-operational");
    const cleared = await clearTenantOperationalData(supabase, tenant.id);
    if (!cleared.ok) {
      console.error(`Clear failed: ${cleared.error}`);
      process.exit(1);
    }
    console.log("Cleared existing guest/reservation data (menu kept).");
  }

  const fixtures = fixturePaths.map((p) => {
    console.log(`  → ${path.relative(XYVOO_NEXT, p)}`);
    return loadFixtureFile(p);
  });
  const merged = mergeGuestStayFixtures(fixtures);

  const result = await seedGuestStaysFromFixture(supabase, tenant.id, slug, merged);
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
