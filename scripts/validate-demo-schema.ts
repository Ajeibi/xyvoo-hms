/**
 * Verify demo seed payload covers every column in DEMO_SCHEMA_FIELD_MAP.
 * Usage: npx tsx scripts/validate-demo-schema.ts
 */
import { validateDemoSeedPayload } from "../src/lib/hms/seed/validate-demo-payload";

const result = validateDemoSeedPayload();

console.log("Demo seed column coverage\n");
for (const s of result.summary) {
  console.log(`  ${s.table}: ${s.rows} row(s), ${s.columns} columns`);
}

if (result.ok) {
  console.log("\nOK — every mapped column is present on every demo row.");
  process.exit(0);
}

console.error(`\n${result.errors.length} issue(s):\n`);
for (const e of result.errors) console.error(`  - ${e}`);
process.exit(1);
