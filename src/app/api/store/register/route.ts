import { NextResponse } from "next/server";
import { z } from "zod";
import { storeSubdomainSchema } from "@/lib/store/subdomain";
import { provisionStoreDefaults } from "@/lib/store/site/data";
import { signupIntentSchema } from "@/lib/store/site/signup-intent";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { CODE_TTL_MINUTES, issueAccountCode, maskEmail } from "@/lib/auth/account-codes";
import { sendAccountCodeEmail } from "@/lib/mail/mailtrap";

const RegisterSchema = z.object({
  fullName: z.string().trim().max(120).optional(),
  firstName: z.string().trim().max(60).optional(),
  lastName: z.string().trim().max(60).optional(),
  phone: z
    .string()
    .trim()
    .refine((v) => v.replace(/\D/g, "").length >= 7, "Enter a phone number we can reach you on."),
  storeName: z.string().trim().min(2, "Store name must be at least 2 characters."),
  slug: storeSubdomainSchema,
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters long.")
    .max(72, "Use 72 characters or fewer.")
    .refine((p) => /[A-Z]/.test(p), "Password must contain at least one capital letter.")
    .refine((p) => /[a-z]/.test(p), "Password must contain at least one small letter.")
    .refine((p) => /[0-9]/.test(p), "Password must contain at least one number.")
    .refine((p) => /[^A-Za-z0-9]/.test(p), "Password must contain at least one special character."),
  acceptedTerms: z.literal(true, { error: "Please agree to the terms and privacy policy to continue." }),
  ...signupIntentSchema.shape,
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = RegisterSchema.safeParse(body);

  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => ({
      field: String(i.path[0]),
      message: i.message,
    }));
    return NextResponse.json(
      {
        error: parsed.error.issues[0]?.message || "Invalid registration details.",
        errors,
      },
      { status: 400 },
    );
  }

  const { firstName, lastName, phone, storeName, slug, email, password, plan, template } = parsed.data;
  const resolvedFullName = (
    parsed.data.fullName ||
    [firstName, lastName].filter(Boolean).join(" ")
  ).trim();

  if (resolvedFullName.length < 2) {
    return NextResponse.json(
      {
        error: "Enter your first and last name.",
        errors: [
          { field: "firstName", message: "First name is required." },
          { field: "lastName", message: "Last name is required." },
        ],
      },
      { status: 400 },
    );
  }

  const service = createServerSupabaseClient();

  const { data: existingTenant } = await service
    .from("tenants")
    .select("id")
    .eq("product", "store")
    .or(`subdomain.eq.${slug},name.eq.${slug}`)
    .maybeSingle();

  if (existingTenant) {
    return NextResponse.json(
      {
        error: "That storefront address is already taken.",
        errors: [{ field: "slug", message: "That storefront address is already taken. Please choose another." }],
      },
      { status: 409 },
    );
  }

  // Created unconfirmed: the owner confirms with an emailed code (see
  // /api/auth/verify-email) before they can sign in with the password.
  const { data: created, error: createUserError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: {
      full_name: resolvedFullName,
      first_name: firstName || resolvedFullName.split(" ")[0],
      last_name: lastName || resolvedFullName.split(" ").slice(1).join(" "),
      phone,
      terms_accepted_at: new Date().toISOString(),
    },
  });

  if (createUserError || !created.user) {
    const message = createUserError?.message.includes("already been registered")
      ? "An account with that email already exists. Try signing in instead."
      : createUserError?.message || "Failed to create account.";
    return NextResponse.json(
      {
        error: message,
        errors: [{ field: "email", message }],
      },
      { status: 400 },
    );
  }

  const userId = created.user.id;

  const { data: tenant, error: tenantError } = await service
    .from("tenants")
    .insert({ subdomain: slug, name: slug, display_name: storeName, product: "store" })
    .select("id")
    .single();

  if (tenantError || !tenant) {
    await service.auth.admin.deleteUser(userId);
    return NextResponse.json(
      { error: tenantError?.message || "Failed to create storefront." },
      { status: 400 },
    );
  }

  const { error: membershipError } = await service
    .schema("store")
    .from("memberships")
    .insert({ tenant_id: tenant.id, user_id: userId, role: "owner" });

  if (membershipError) {
    await service.from("tenants").delete().eq("id", tenant.id);
    await service.auth.admin.deleteUser(userId);
    return NextResponse.json({ error: membershipError.message || "Failed to set up owner access." }, { status: 400 });
  }

  try {
    await provisionStoreDefaults(tenant.id, { templateSlug: template, plan }, service);
  } catch (error) {
    await service.from("tenants").delete().eq("id", tenant.id);
    await service.auth.admin.deleteUser(userId);
    console.error("[store/register] provisioning failed", error);
    return NextResponse.json({ error: "We couldn't finish setting up your store. Please try again." }, { status: 500 });
  }

  // The store exists now even if the email fails; the owner can ask for a new code.
  let codeSent = false;
  try {
    const code = await issueAccountCode(userId, "verify_email");
    if (code) {
      await sendAccountCodeEmail({ to: email, name: resolvedFullName, code, purpose: "verify_email", expiresInMinutes: CODE_TTL_MINUTES });
      codeSent = true;
    }
  } catch (error) {
    console.error("[store/register] verification email failed", error);
  }

  return NextResponse.json({ success: true, slug, verificationRequired: true, codeSent, sentTo: maskEmail(email) }, { status: 201 });
}
