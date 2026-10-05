import { z } from "zod";
import { basicsSchema, contactFields } from "./site/onboarding-steps";

/**
 * Settings → Store details: what the wizard collected about the business,
 * editable later. The web address and country aren't here: changing them has
 * knock-on effects (links, currency) and belongs on its own screen.
 */
export const storeDetailsSchema = z.object({
  storeName: basicsSchema.shape.storeName,
  category: basicsSchema.shape.category,
  ...contactFields,
});

export type StoreDetails = z.infer<typeof storeDetailsSchema>;
