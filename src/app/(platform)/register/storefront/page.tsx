"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import { Check, CircleAlert, Eye, EyeOff } from "lucide-react";
import WebsiteLayout from "@/components/website/WebsiteLayout";
import { supabaseAuthBrowser } from "@/lib/supabase/auth-browser";
import { toastError, toastSuccess } from "@/lib/app-toast";
import "react-phone-number-input/style.css";
import PhoneInput, { isValidPhoneNumber } from "react-phone-number-input";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import EmailCodeForm from "@/components/auth/EmailCodeForm";
import { SubdomainInput } from "@/components/forms/SubdomainInput";
import StorefrontValidationModal, { type ValidationErrorItem } from "@/components/storefront/StorefrontValidationModal";
import type { GoogleCredentialResponse } from "@/lib/auth/google-identity";
import { slugifyStoreName as slugify, storeSubdomainSchema } from "@/lib/store/subdomain";
import { readSignupIntent } from "@/lib/store/site/signup-intent";
import { cn } from "@/lib/utils";

const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  lastName: "Last name",
  phone: "Phone number",
  storeName: "Store name",
  slug: "Storefront URL",
  email: "Email address",
  password: "Password",
  confirmPassword: "Confirm password",
  acceptedTerms: "Terms and privacy agreement",
};

const FIELD_ELEMENT_IDS: Record<string, string> = {
  firstName: "storefront-register-first-name",
  lastName: "storefront-register-last-name",
  phone: "storefront-register-phone",
  storeName: "storefront-register-name",
  slug: "storefront-register-slug",
  email: "storefront-register-email",
  password: "storefront-register-password",
  confirmPassword: "storefront-register-confirm-password",
  acceptedTerms: "storefront-register-terms",
};

const inputBaseClass =
  "w-full px-4 py-3 text-sm text-black placeholder:text-slate-400 bg-white border rounded-xl focus:outline-none focus:ring-2 transition-colors";
const inputNormalClass =
  "border-slate-300 focus:ring-xyvoo-teal-product-hover focus:border-transparent";
const inputErrorClass =
  "border-rose-500 focus:ring-rose-400 focus:border-rose-500 bg-rose-50/20";

export default function StorefrontRegisterPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // After the account is created, the same page asks for the emailed code.
  const [verification, setVerification] = useState<{ slug: string; sentTo?: string } | null>(null);
  const [storeName, setStoreName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [validationModalErrors, setValidationModalErrors] = useState<ValidationErrorItem[]>([]);
  const [showValidationModal, setShowValidationModal] = useState(false);

  const passwordCriteria = [
    { label: "At least 8 characters long", met: password.length >= 8 },
    { label: "Must have a capital letter", met: /[A-Z]/.test(password) },
    { label: "Must have a small letter", met: /[a-z]/.test(password) },
    { label: "Must have a number", met: /[0-9]/.test(password) },
    { label: "Must have a special character", met: /[^A-Za-z0-9]/.test(password) },
  ];
  const isPasswordValid = passwordCriteria.every((c) => c.met);
  const metCount = passwordCriteria.filter((c) => c.met).length;

  const clearError = () => {
    if (error) setError("");
  };

  const clearFieldError = (fieldKey: string) => {
    if (fieldErrors[fieldKey]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[fieldKey];
        return next;
      });
    }
    if (error) setError("");
  };

  const handleCloseModal = () => {
    setShowValidationModal(false);
    // Focus the first invalid field so user can fix it right away
    if (validationModalErrors.length > 0) {
      const firstField = validationModalErrors[0]?.field;
      if (firstField && FIELD_ELEMENT_IDS[firstField]) {
        setTimeout(() => {
          const el = document.getElementById(FIELD_ELEMENT_IDS[firstField]);
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            el.focus();
          }
        }, 120);
      }
    }
  };

  const handleStoreNameChange = (value: string) => {
    setStoreName(value);
    if (!slugTouched) setSlug(slugify(value));
  };

  const handleGoogleCredential = async (response: GoogleCredentialResponse) => {
    setLoading(true);
    setError("");

    const { error: idTokenError } = await supabaseAuthBrowser.auth.signInWithIdToken({
      provider: "google",
      token: response.credential,
    });

    if (idTokenError) {
      setError(idTokenError.message);
      toastError("Google sign-in failed", idTokenError.message);
      setLoading(false);
      return;
    }

    try {
      const redirectRes = await fetch("/api/store/auth/post-login-redirect", { method: "POST" });
      const redirectData = await redirectRes.json().catch(() => ({}));

      toastSuccess("Signed in", "Welcome to XYVOO. Opening your dashboard…");
      await new Promise((resolve) => setTimeout(resolve, 500));
      // Keep ?plan= / ?template= so the Google path pre-fills the wizard too.
      window.location.assign(redirectData.redirectTo || `/register/storefront/complete${window.location.search}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");

    // Validate ALL fields at once
    const nextErrors: Record<string, string> = {};
    const modalItems: ValidationErrorItem[] = [];

    const addError = (field: string, message: string) => {
      nextErrors[field] = message;
      modalItems.push({
        field,
        label: FIELD_LABELS[field] || field,
        message,
      });
    };

    if (!firstName.trim()) {
      addError("firstName", "Please enter your first name.");
    }
    if (!lastName.trim()) {
      addError("lastName", "Please enter your last name.");
    }
    if (!phone || !phone.trim()) {
      addError("phone", "Please enter your phone number.");
    } else if (!isValidPhoneNumber(phone)) {
      addError("phone", "Please enter a valid phone number with country code.");
    }
    if (!storeName.trim()) {
      addError("storeName", "Please enter your store name.");
    } else if (storeName.trim().length < 2) {
      addError("storeName", "Store name must be at least 2 characters.");
    }
    if (!slug.trim()) {
      addError("slug", "Please enter your storefront web address.");
    } else {
      const slugParsed = storeSubdomainSchema.safeParse(slug);
      if (!slugParsed.success) {
        addError("slug", slugParsed.error.issues[0]?.message || "Invalid web address.");
      }
    }
    if (!email.trim()) {
      addError("email", "Please enter your email address.");
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email.trim())) {
        addError("email", "Please enter a valid email address.");
      }
    }
    if (!password) {
      addError("password", "Please create a password.");
    } else if (!isPasswordValid) {
      addError("password", "Password must meet all strength criteria (at least 8 chars, uppercase, lowercase, number, symbol).");
    }
    if (!confirmPassword) {
      addError("confirmPassword", "Please confirm your password.");
    } else if (password !== confirmPassword) {
      addError("confirmPassword", "Passwords do not match.");
    }
    if (!acceptedTerms) {
      addError("acceptedTerms", "Please agree to the terms of service and privacy policy to continue.");
    }

    if (modalItems.length > 0) {
      setFieldErrors(nextErrors);
      setValidationModalErrors(modalItems);
      setShowValidationModal(true);
      return;
    }

    setLoading(true);

    const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

    try {
      const res = await fetch("/api/store/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone,
          storeName,
          slug,
          email,
          password,
          acceptedTerms,
          ...readSignupIntent(window.location.search),
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = typeof data.error === "string" ? data.error : "Failed to register storefront.";
        if (Array.isArray(data.errors) && data.errors.length > 0) {
          const map: Record<string, string> = {};
          const list: ValidationErrorItem[] = [];
          for (const item of data.errors) {
            map[item.field] = item.message;
            list.push({
              field: item.field,
              label: FIELD_LABELS[item.field] || item.field,
              message: item.message,
            });
          }
          setFieldErrors(map);
          setValidationModalErrors(list);
          setShowValidationModal(true);
        } else {
          setError(message);
          toastError("Registration failed", message);
        }
        return;
      }

      setVerification({ slug: data.slug, sentTo: data.codeSent ? data.sentTo : undefined });
      window.scrollTo({ top: 0 });
    } catch {
      const message = "We couldn't reach the registration service. Check your internet connection and try again.";
      setError(message);
      toastError("Connection problem", message);
    } finally {
      setLoading(false);
    }
  };

  // Confirmed: sign in with the password still held in this page and open the dashboard.
  const handleVerified = async () => {
    if (!verification) return;
    const { error: signInError } = await supabaseAuthBrowser.auth.signInWithPassword({ email, password });
    if (signInError) {
      toastSuccess("Email confirmed", "Sign in to continue.");
      window.location.assign("/auth/login/storefront");
      return;
    }
    toastSuccess("Email confirmed", "Opening your dashboard…");
    window.location.assign(`/storefront/${verification.slug}/dashboard`);
  };

  const verifyStep = verification ? (
    <>
      <div className="space-y-2">
        <p className="text-sm font-bold uppercase tracking-wider text-xyvoo-teal-product-hover">XYVOO Storefront</p>
        <h1 className="text-4xl font-bold leading-tight text-black">Check your email</h1>
        <p className="text-base leading-relaxed text-black">
          Your store is set up. Enter the code we emailed you to confirm your address and open your dashboard.
        </p>
      </div>
      <EmailCodeForm email={email} sentTo={verification.sentTo} autoSend={!verification.sentTo} onVerified={handleVerified} />
    </>
  ) : null;

  const form = verifyStep ?? (
    <>
      <motion.div
        className="space-y-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <p className="text-sm font-bold uppercase tracking-wider text-xyvoo-teal-product-hover">
          XYVOO Storefront
        </p>
        <h1 className="text-4xl font-bold text-black leading-tight">Register your storefront</h1>
        <motion.p
          className="text-base text-black leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Set up your merchant account to start managing products and orders.
        </motion.p>
      </motion.div>

      {error ? (
        <motion.div
          role="alert"
          aria-live="polite"
          className="flex gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden />
          <p>{error}</p>
        </motion.div>
      ) : null}

      <GoogleSignInButton onCredential={handleGoogleCredential} className="flex w-full justify-center" />

      <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-wider text-black">
        <span className="h-px flex-1 bg-slate-300" />
        or register with email
        <span className="h-px flex-1 bg-slate-300" />
      </div>

      <motion.form
        noValidate
        onSubmit={handleSubmit}
        className="space-y-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="storefront-register-first-name" className={cn("mb-1.5 block text-sm font-medium", fieldErrors.firstName ? "text-rose-700" : "text-black")}>
              First name
            </label>
            <input
              id="storefront-register-first-name"
              name="firstName"
              className={cn(inputBaseClass, fieldErrors.firstName ? inputErrorClass : inputNormalClass)}
              autoComplete="given-name"
              placeholder="Your first name"
              value={firstName}
              onChange={(e) => {
                clearFieldError("firstName");
                setFirstName(e.target.value);
              }}
            />
            {fieldErrors.firstName ? (
              <p className="mt-1.5 text-xs font-semibold text-rose-600">{fieldErrors.firstName}</p>
            ) : null}
          </div>
          <div>
            <label htmlFor="storefront-register-last-name" className={cn("mb-1.5 block text-sm font-medium", fieldErrors.lastName ? "text-rose-700" : "text-black")}>
              Last name
            </label>
            <input
              id="storefront-register-last-name"
              name="lastName"
              className={cn(inputBaseClass, fieldErrors.lastName ? inputErrorClass : inputNormalClass)}
              autoComplete="family-name"
              placeholder="Your last name"
              value={lastName}
              onChange={(e) => {
                clearFieldError("lastName");
                setLastName(e.target.value);
              }}
            />
            {fieldErrors.lastName ? (
              <p className="mt-1.5 text-xs font-semibold text-rose-600">{fieldErrors.lastName}</p>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor="storefront-register-phone" className={cn("mb-1.5 block text-sm font-medium", fieldErrors.phone ? "text-rose-700" : "text-black")}>
            Phone number
          </label>
          <PhoneInput
            international
            defaultCountry="NG"
            value={phone}
            onChange={(val) => {
              clearFieldError("phone");
              setPhone(val || "");
            }}
            placeholder="803 123 4567"
            numberInputProps={{
              id: "storefront-register-phone",
              name: "phone",
              "aria-describedby": "storefront-register-phone-hint",
            }}
            className={cn("storefront-phone-input", fieldErrors.phone && "has-error")}
            style={{ ["--PhoneInputCountryFlag-height" as string]: "1.2em" }}
          />
          {fieldErrors.phone ? (
            <p className="mt-1.5 text-xs font-semibold text-rose-600">{fieldErrors.phone}</p>
          ) : (
            <p id="storefront-register-phone-hint" className="mt-1.5 text-sm text-slate-800">
              So we can reach you about your account. It isn&rsquo;t shown on your shop.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="storefront-register-name" className={cn("mb-1.5 block text-sm font-medium", fieldErrors.storeName ? "text-rose-700" : "text-black")}>
            Store name
          </label>
          <input
            id="storefront-register-name"
            name="storeName"
            className={cn(inputBaseClass, fieldErrors.storeName ? inputErrorClass : inputNormalClass)}
            placeholder="e.g. Kaine & Co"
            autoComplete="organization"
            value={storeName}
            onChange={(e) => {
              clearFieldError("storeName");
              handleStoreNameChange(e.target.value);
            }}
          />
          {fieldErrors.storeName ? (
            <p className="mt-1.5 text-xs font-semibold text-rose-600">{fieldErrors.storeName}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="storefront-register-slug" className={cn("mb-1.5 block text-sm font-medium", fieldErrors.slug ? "text-rose-700" : "text-black")}>
            Storefront URL
          </label>
          <SubdomainInput
            id="storefront-register-slug"
            name="slug"
            placeholder="your-store"
            value={slug}
            hasError={Boolean(fieldErrors.slug)}
            onChange={(e) => {
              clearFieldError("slug");
              setSlugTouched(true);
              setSlug(slugify(e.target.value));
            }}
            ringClassName="focus-within:ring-xyvoo-teal-product-hover"
          />
          {fieldErrors.slug ? (
            <p className="mt-1.5 text-xs font-semibold text-rose-600">{fieldErrors.slug}</p>
          ) : (
            <p className="mt-1.5 text-sm text-slate-800">
              Lowercase letters, numbers, and hyphens only. This becomes your shop&rsquo;s web address. You can switch to your own custom domain later.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="storefront-register-email" className={cn("mb-1.5 block text-sm font-medium", fieldErrors.email ? "text-rose-700" : "text-black")}>
            Email address
          </label>
          <input
            id="storefront-register-email"
            name="email"
            className={cn(inputBaseClass, fieldErrors.email ? inputErrorClass : inputNormalClass)}
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              clearFieldError("email");
              setEmail(e.target.value);
            }}
          />
          {fieldErrors.email ? (
            <p className="mt-1.5 text-xs font-semibold text-rose-600">{fieldErrors.email}</p>
          ) : null}
        </div>

        <div>
          <label htmlFor="storefront-register-password" className={cn("mb-1.5 block text-sm font-medium", fieldErrors.password ? "text-rose-700" : "text-black")}>
            Password
          </label>
          <div className="relative">
            <input
              id="storefront-register-password"
              name="password"
              className={cn(inputBaseClass, "pr-11", fieldErrors.password ? inputErrorClass : inputNormalClass)}
              type={showPassword ? "text" : "password"}
              placeholder="Create a strong password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                clearFieldError("password");
                setPassword(e.target.value);
              }}
              onFocus={() => setPasswordFocused(true)}
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 px-3 text-slate-500 hover:text-slate-700"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {fieldErrors.password ? (
            <p className="mt-1.5 text-xs font-semibold text-rose-600">{fieldErrors.password}</p>
          ) : null}

          {(password.length > 0 || passwordFocused) && (
            <div className="mt-2.5 rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-700">Password strength</span>
                <span
                  className={`font-semibold ${
                    metCount === 5
                      ? "text-emerald-700"
                      : metCount >= 3
                        ? "text-amber-700"
                        : "text-rose-600"
                  }`}
                >
                  {metCount === 5 ? "Strong" : metCount >= 3 ? "Moderate" : "Weak"}
                </span>
              </div>

              {/* 5-segment strength meter */}
              <div className="grid grid-cols-5 gap-1.5">
                {[1, 2, 3, 4, 5].map((level) => (
                  <div
                    key={level}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      metCount >= level
                        ? metCount === 5
                          ? "bg-emerald-500"
                          : metCount >= 3
                            ? "bg-amber-500"
                            : "bg-rose-500"
                        : "bg-slate-200"
                    }`}
                  />
                ))}
              </div>

              {/* Real-time criteria visual checks */}
              <div className="grid grid-cols-1 gap-1.5 pt-1 sm:grid-cols-2">
                {passwordCriteria.map((criterion, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-2 transition-colors duration-200 ${
                      criterion.met ? "text-emerald-900 font-medium" : "text-slate-600"
                    } ${idx === 0 ? "sm:col-span-2" : ""}`}
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
                        criterion.met
                          ? "bg-emerald-500 text-white"
                          : "border border-slate-300 bg-white text-transparent"
                      }`}
                    >
                      <Check className="h-2.5 w-2.5 stroke-[3]" />
                    </span>
                    <span>{criterion.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="storefront-register-confirm-password"
            className={cn("mb-1.5 block text-sm font-medium", fieldErrors.confirmPassword ? "text-rose-700" : "text-black")}
          >
            Confirm password
          </label>
          <input
            id="storefront-register-confirm-password"
            name="confirmPassword"
            className={cn(inputBaseClass, fieldErrors.confirmPassword ? inputErrorClass : inputNormalClass)}
            type={showPassword ? "text" : "password"}
            placeholder="Re-enter your password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => {
              clearFieldError("confirmPassword");
              setConfirmPassword(e.target.value);
            }}
          />
          {fieldErrors.confirmPassword ? (
            <p className="mt-1.5 text-xs font-semibold text-rose-600">{fieldErrors.confirmPassword}</p>
          ) : confirmPassword && password ? (
            <p className={`mt-1.5 text-sm font-medium ${confirmPassword === password ? "text-green-700" : "text-red-600"}`}>
              {confirmPassword === password ? "✓ Passwords match" : "Passwords do not match"}
            </p>
          ) : null}
        </div>

        <div className={cn("rounded-xl transition-all", fieldErrors.acceptedTerms && "p-3 bg-rose-50/70 border border-rose-300 ring-2 ring-rose-200")}>
          <label className="flex items-start gap-3 text-sm text-black cursor-pointer">
            <input
              id="storefront-register-terms"
              type="checkbox"
              name="acceptedTerms"
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 accent-xyvoo-teal-product-hover"
              checked={acceptedTerms}
              onChange={(e) => {
                clearFieldError("acceptedTerms");
                setAcceptedTerms(e.target.checked);
              }}
            />
            <span>
              I agree to the{" "}
              <Link href="/terms" className="font-semibold text-black underline hover:text-xyvoo-teal-product-hover" target="_blank">
                terms of service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="font-semibold text-black underline hover:text-xyvoo-teal-product-hover" target="_blank">
                privacy policy
              </Link>
              .
            </span>
          </label>
          {fieldErrors.acceptedTerms ? (
            <p className="mt-1.5 text-xs font-semibold text-rose-600">{fieldErrors.acceptedTerms}</p>
          ) : null}
        </div>

        <button
          disabled={loading}
          type="submit"
          className="w-full rounded-2xl border-2 border-xyvoo-teal-product-hover bg-xyvoo-teal-product-hover py-3 font-semibold text-white transition-transform duration-300 ease-in-out hover:rotate-[5deg] hover:bg-white hover:text-xyvoo-teal-product-hover disabled:opacity-60 disabled:hover:rotate-0 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? "Creating storefront..." : "Create storefront"}
        </button>
      </motion.form>

      <StorefrontValidationModal
        isOpen={showValidationModal}
        onClose={handleCloseModal}
        errors={validationModalErrors}
        title="Incomplete Registration Form"
        description="Please complete and correct the following required fields before creating your storefront:"
        confirmText="Okay, I will complete them"
      />

      <motion.p
        className="text-center text-sm font-medium text-black"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      >
        Already have a storefront?{" "}
        <Link className="font-semibold text-black underline hover:text-xyvoo-teal-product-hover" href="/auth/login/storefront">
          Sign in
        </Link>
      </motion.p>
    </>
  );

  return (
    <WebsiteLayout>
      {/* The form renders once so its ids stay unique; only the image treatment changes by breakpoint. */}
      <div className="relative w-full overflow-hidden bg-white pt-[76px] pb-16 lg:grid lg:grid-cols-2 lg:overflow-visible lg:pb-0">
        {/* Mobile: faded image behind the form */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden lg:hidden" aria-hidden>
          <Image src="/images/storefront/login.png" alt="" fill className="object-cover opacity-10" sizes="100vw" />
        </div>

        {/* Desktop: image sticks in view while the form scrolls past it, then the page continues into the CTA + footer */}
        <div className="relative hidden h-[calc(100vh-76px)] overflow-hidden bg-white lg:sticky lg:top-[76px] lg:block">
          <Image
            src="/images/storefront/login.png"
            alt="Register your storefront"
            fill
            className="object-cover"
            sizes="50vw"
            preload
          />
        </div>

        <div className="relative z-10 flex items-center justify-center p-4 sm:p-6 lg:items-stretch lg:p-12">
          <div className="w-full max-w-sm space-y-6 rounded-2xl bg-white/95 p-6 shadow-xl backdrop-blur-md border border-slate-100/80 sm:max-w-md sm:p-8 lg:max-w-md lg:rounded-none lg:bg-transparent lg:p-0 lg:shadow-none lg:border-0 lg:backdrop-blur-none lg:pb-20">
            {form}
          </div>
        </div>
      </div>
    </WebsiteLayout>
  );
}
