import type { Metadata } from "next";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false, follow: false } };

/** ?for=storefront returns to the Storefront sign-in afterwards; anything else to the HMS one. */
export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ for?: string }> }) {
  const { for: product } = await searchParams;
  return <ForgotPasswordForm product={product === "storefront" ? "storefront" : "hms"} />;
}
