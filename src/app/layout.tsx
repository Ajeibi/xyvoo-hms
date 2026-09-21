import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { SupabaseNetworkErrorGuard } from "@/components/SupabaseNetworkErrorGuard";

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "XYVOO — Software that runs your business",
    template: "%s | XYVOO",
  },
  description:
    "XYVOO builds dedicated, fully branded platforms for hotels and online retailers — a Hotel Management System and an online Storefront, each built for the business it serves.",
  openGraph: {
    siteName: "XYVOO",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "XYVOO Technologies Ltd",
  url: siteUrl,
  logo: `${siteUrl}/images/xyvoo-logo.png`,
  contactPoint: [
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone: "+234-800-998-6661",
      email: "lagos@xyvoo.com",
      areaServed: "NG",
    },
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone: "+254-700-998-661",
      email: "nairobi@xyvoo.com",
      areaServed: "KE",
    },
    {
      "@type": "ContactPoint",
      contactType: "customer support",
      telephone: "+44-20-7946-0998",
      email: "london@xyvoo.com",
      areaServed: "GB",
    },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased font-sans" suppressHydrationWarning>
      <body
        className="relative mx-auto flex min-h-full w-full max-w-[1800px] flex-col shadow-[var(--xyvoo-shadow-column)]"
        suppressHydrationWarning
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
        <SupabaseNetworkErrorGuard />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
