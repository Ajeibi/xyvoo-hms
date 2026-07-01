import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

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
    <html lang="en" className="h-full antialiased font-sans">
      <body
        className="relative mx-auto flex min-h-full w-full max-w-[1800px] flex-col shadow-[var(--xyvoo-shadow-column)]"
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
