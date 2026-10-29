import { z } from "zod";

/*
 * zod v4 checks whether it may build validators with `Function("")`, which
 * our Content-Security-Policy (no 'unsafe-eval') reports, and which would be
 * blocked once the policy is enforced. Its jitless mode validates the same
 * way without that. Imported for its side effect by src/instrumentation-client.ts,
 * which runs before any schema is built in the browser.
 */
z.config({ jitless: true });
