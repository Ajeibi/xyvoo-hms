/** Same cost-centre vocabulary as Procurement's purchase-order form (Kitchen/Bar/Housekeeping/
 * Front Desk/Engineering/Procurement/Other), plus Accounts itself as a valid cost centre.
 * Lives in its own module so client components can import it without pulling in server-only code. */
export const ACCOUNTS_DEPARTMENTS = [
  "Kitchen",
  "Bar",
  "Housekeeping",
  "Front Desk",
  "Engineering",
  "Procurement",
  "Accounts",
  "Other",
] as const;

/** Cost-centre tags elsewhere (e.g. Inventory's free-text `requesting_department`) aren't
 * validated against this list — normalize case-insensitively rather than inventing a value. */
export function normalizeAccountsDepartment(value: string | null | undefined): (typeof ACCOUNTS_DEPARTMENTS)[number] {
  const match = ACCOUNTS_DEPARTMENTS.find((d) => d.toLowerCase() === (value ?? "").trim().toLowerCase());
  return match ?? "Other";
}
