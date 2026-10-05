import { z } from "zod";
import { STORE_PLANS } from "./onboarding";
import { STOREFRONT_TEMPLATE_SLUGS } from "./templates";

/**
 * Choices carried from marketing links into registration, e.g.
 * /register/storefront?plan=standard&template=loftwood. Unknown values are
 * dropped silently: they only pre-fill the wizard, never decide anything.
 */
export const signupIntentSchema = z.object({
  plan: z.enum(STORE_PLANS).nullable().catch(null),
  template: z.enum(STOREFRONT_TEMPLATE_SLUGS).nullable().catch(null),
});

export type SignupIntent = z.infer<typeof signupIntentSchema>;

export function readSignupIntent(search: string | URLSearchParams): SignupIntent {
  const params = typeof search === "string" ? new URLSearchParams(search) : search;
  return signupIntentSchema.parse({ plan: params.get("plan"), template: params.get("template") });
}
