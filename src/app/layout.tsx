import type { Metadata } from "next";
import "./globals.css";
import { DM_Sans, Exo_2, Geist } from "next/font/google";
import { Toaster } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const exo2 = Exo_2({
  subsets: ["latin"],
  variable: "--font-products-display",
  weight: ["700", "800"],
});
const dmSansProducts = DM_Sans({
  subsets: ["latin"],
  variable: "--font-products-sans",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "XYVOO HMS",
  description: "XYVOO Hotel Management Platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "h-full antialiased",
        "font-sans",
        geist.variable,
        exo2.variable,
        dmSansProducts.variable,
      )}
    >
      <body
        className="relative mx-auto flex min-h-full w-full max-w-[1800px] flex-col shadow-[var(--xyvoo-shadow-column)]"
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
