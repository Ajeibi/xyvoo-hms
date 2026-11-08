/*
 * The ID reading contract. A reader takes photos of a guest's ID and proposes the details printed on
 * it. It never saves anything: staff check the proposal and the screen applies it. Each reader (a
 * vision model today; a dedicated ID verification service later) is one adapter in ./adapters,
 * chosen in ./registry.ts. Safe for the browser and the server.
 */

export const ID_TYPES = ["passport", "national_id", "drivers_license"] as const;
export type IdType = (typeof ID_TYPES)[number];

export const ID_TYPE_LABELS: Record<IdType, string> = {
  passport: "Passport",
  national_id: "National ID",
  drivers_license: "Driver's licence",
};

/** What was read. Every field is optional because a photo may not show it. Dates are YYYY-MM-DD. */
export type IdFields = {
  firstName?: string;
  lastName?: string;
  idType?: IdType;
  idNumber?: string;
  /** Two-letter country code, as the check-in form keeps it. */
  nationality?: string;
  dateOfBirth?: string;
  idExpiryDate?: string;
};

export type IdReadImage = { bytes: Uint8Array; mime: string };

export type IdReadResult =
  | {
      ok: true;
      fields: IdFields;
      /** True when the machine-readable strip passed every check digit, so the details are not a guess. */
      verifiedByMrz: boolean;
      /** Things staff should look at before accepting, in plain words. */
      warnings: string[];
    }
  | { ok: false; error: string; retryable: boolean };

export interface IdReader {
  readonly id: string;
  readId(images: IdReadImage[]): Promise<IdReadResult>;
}
