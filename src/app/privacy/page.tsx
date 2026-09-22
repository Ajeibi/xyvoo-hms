import type { Metadata } from "next";
import type { ReactNode } from "react";
import WebsiteLayout from "@/components/website/WebsiteLayout";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How XYVOO collects, uses, and protects your data.",
  alternates: { canonical: "/privacy" },
};

const SECTIONS: { heading: string; body: ReactNode }[] = [
  {
    heading: "Who we are",
    body: (
      <p>
        XYVOO Technologies Ltd (&quot;XYVOO&quot;, &quot;we&quot;, &quot;us&quot;) provides software for running
        hotels and online storefronts, including the XYVOO Hotel Management System and XYVOO Storefront (together, the
        &quot;Services&quot;). This policy explains what personal data we collect from people who use the Services —
        business owners, staff, and their end customers or guests — and how we use it.
      </p>
    ),
  },
  {
    heading: "Information we collect",
    body: (
      <>
        <p>We collect the following categories of information:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>Account information</strong> — name, email address, and password (or, if you sign in with Google,
            the name, email address, and profile photo Google shares with us).
          </li>
          <li>
            <strong>Business and operational data</strong> — the hotel, storefront, product, order, booking, and
            guest/customer records you or your staff enter while using the Services.
          </li>
          <li>
            <strong>Payment information</strong> — payments are processed by Paystack; we do not store full card
            numbers ourselves.
          </li>
          <li>
            <strong>Usage data</strong> — log and device information such as IP address, browser type, and pages
            visited, collected automatically to keep the Services secure and reliable.
          </li>
        </ul>
      </>
    ),
  },
  {
    heading: "Signing in with Google",
    body: (
      <p>
        If you choose &quot;Continue with Google&quot;, we receive your name, email address, and profile photo from
        Google to create or sign in to your XYVOO account. We do not receive your Google password, and we only
        request the minimum information needed for authentication. You can review or revoke XYVOO&apos;s access at
        any time from your{" "}
        <a
          href="https://myaccount.google.com/permissions"
          className="text-xyvoo-teal-product-hover underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          Google Account permissions
        </a>{" "}
        page.
      </p>
    ),
  },
  {
    heading: "How we use your information",
    body: (
      <ul className="list-disc pl-5 space-y-1">
        <li>To create and secure your account, and authenticate you when you sign in.</li>
        <li>To provide the core functionality of the Services — bookings, orders, inventory, billing, and reporting.</li>
        <li>To send service-related communications, such as account, order, or booking notifications.</li>
        <li>To detect, investigate, and prevent fraud, abuse, and security incidents.</li>
        <li>To comply with legal obligations and enforce our terms of service.</li>
      </ul>
    ),
  },
  {
    heading: "Who we share information with",
    body: (
      <>
        <p>We do not sell personal information. We share data only with:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Service providers who help us run XYVOO, including Supabase (database and authentication), Google (sign-in), and Paystack (payment processing).</li>
          <li>Other staff within your own organisation&apos;s XYVOO account, according to the roles and permissions you assign them.</li>
          <li>Law enforcement or regulators, where required by law.</li>
        </ul>
      </>
    ),
  },
  {
    heading: "Data retention",
    body: (
      <p>
        We retain personal data for as long as your account is active, or as needed to provide the Services, comply
        with our legal obligations, resolve disputes, and enforce our agreements. You can request deletion of your
        account data at any time using the contact details below.
      </p>
    ),
  },
  {
    heading: "Your rights",
    body: (
      <p>
        Depending on where you are based, you may have the right to access, correct, export, or delete your personal
        data, or to object to or restrict certain processing. To exercise any of these rights, contact us at{" "}
        <a href="mailto:support@getxyvoo.com" className="text-xyvoo-teal-product-hover underline">
          support@getxyvoo.com
        </a>
        .
      </p>
    ),
  },
  {
    heading: "Security",
    body: (
      <p>
        We use industry-standard technical and organisational measures, including encryption in transit and
        access controls, to protect personal data against unauthorised access, loss, or misuse.
      </p>
    ),
  },
  {
    heading: "International transfers",
    body: (
      <p>
        XYVOO operates across multiple regions, including Nigeria, Kenya, and the United Kingdom. Your information
        may be processed in a country other than the one you are based in; where this happens, we take steps to
        ensure it remains protected in line with this policy.
      </p>
    ),
  },
  {
    heading: "Children's privacy",
    body: (
      <p>
        The Services are intended for business use and are not directed at children. We do not knowingly collect
        personal data from children.
      </p>
    ),
  },
  {
    heading: "Changes to this policy",
    body: (
      <p>
        We may update this policy from time to time. We will post the updated version on this page with a revised
        effective date.
      </p>
    ),
  },
  {
    heading: "Contact us",
    body: (
      <p>
        Questions about this policy or your data can be sent to{" "}
        <a href="mailto:support@getxyvoo.com" className="text-xyvoo-teal-product-hover underline">
          support@getxyvoo.com
        </a>
        .
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <WebsiteLayout>
      <main className="pt-28 pb-16 px-4 bg-slate-50 min-h-screen">
        <section className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">Privacy Policy</h1>
            <p className="text-sm text-slate-500">Effective date: 22 September 2026</p>
          </div>
          {SECTIONS.map((section) => (
            <div key={section.heading} className="space-y-2">
              <h2 className="text-lg font-semibold text-slate-900">{section.heading}</h2>
              <div className="text-sm text-slate-600 leading-relaxed space-y-2">{section.body}</div>
            </div>
          ))}
        </section>
      </main>
    </WebsiteLayout>
  );
}
