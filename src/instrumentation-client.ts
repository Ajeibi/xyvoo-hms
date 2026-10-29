// Runs in the browser before the app's own code (see Next's instrumentation-client).
// zod's jitless mode must be set before any schema is built: see zod-config.ts.
import "@/lib/zod-config";
