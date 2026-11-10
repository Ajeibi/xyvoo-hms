import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import WebsiteLayout from "@/components/website/WebsiteLayout";

export const metadata: Metadata = {
  title: "Terms and Conditions",
  description:
    "The terms and conditions that govern access to and use of the XYVOO Hotel Management System, XYVOO Storefront, and related services.",
  alternates: { canonical: "/terms" },
};

const EFFECTIVE_DATE = "10 November 2026";
const SUPPORT_EMAIL = "support@getxyvoo.com";

const LINK = "text-xyvoo-teal-product-hover underline";

function Clause({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p>
      <span className="font-semibold text-slate-800">{n}</span> {children}
    </p>
  );
}

function Mail() {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>
      {SUPPORT_EMAIL}
    </a>
  );
}

const SECTIONS: { id: string; heading: string; body: ReactNode }[] = [
  {
    id: "introduction",
    heading: "Introduction and acceptance",
    body: (
      <>
        <Clause n="1.1">
          These Terms and Conditions (the &quot;Terms&quot;) form a legally binding agreement between XYVOO Technologies
          Ltd (&quot;XYVOO&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) and the person or entity that
          registers for, accesses, or uses the Services (&quot;you&quot;, &quot;your&quot;, or the
          &quot;Customer&quot;).
        </Clause>
        <Clause n="1.2">
          By creating an account, clicking to accept these Terms, or accessing or using any part of the Services, you
          confirm that you have read, understood, and agree to be bound by these Terms and by our{" "}
          <Link href="/privacy" className={LINK}>
            Privacy Policy
          </Link>
          , which is incorporated into these Terms by reference. If you do not agree, you must not use the Services.
        </Clause>
        <Clause n="1.3">
          If you accept these Terms on behalf of a company, hotel, business, or other legal entity, you represent and
          warrant that you have the authority to bind that entity, and &quot;you&quot; refers to that entity.
        </Clause>
      </>
    ),
  },
  {
    id: "definitions",
    heading: "Definitions",
    body: (
      <>
        <p>In these Terms, unless the context requires otherwise:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <strong>&quot;Services&quot;</strong> means the XYVOO Hotel Management System (&quot;HMS&quot;), XYVOO
            Storefront, XYVOO hotel and business websites, the related web, mobile, and progressive web applications,
            application programming interfaces, and any associated support, onboarding, and documentation we provide.
          </li>
          <li>
            <strong>&quot;Account&quot;</strong> means the account you create to access the Services, including any
            workspace, property, or store provisioned under it.
          </li>
          <li>
            <strong>&quot;Authorised Users&quot;</strong> means your employees, staff, contractors, and agents whom you
            permit to access the Services under your Account.
          </li>
          <li>
            <strong>&quot;End Users&quot;</strong> means your guests, customers, and other third parties whose
            information you process through the Services, or who interact with your hotel website or storefront.
          </li>
          <li>
            <strong>&quot;Customer Data&quot;</strong> means all data, content, and information that you, your
            Authorised Users, or your End Users submit to or store in the Services.
          </li>
          <li>
            <strong>&quot;Subscription&quot;</strong> means the plan and billing cycle you select for access to the
            Services, and <strong>&quot;Fees&quot;</strong> means the amounts payable for it.
          </li>
          <li>
            <strong>&quot;Applicable Law&quot;</strong> means all laws, regulations, and binding guidance that apply to
            you, to us, or to the use of the Services, including applicable data protection laws.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "eligibility",
    heading: "Eligibility and accounts",
    body: (
      <>
        <Clause n="3.1">
          The Services are intended for business use. You must be at least 18 years old and able to form a binding
          contract under Applicable Law to register for an Account.
        </Clause>
        <Clause n="3.2">
          You agree to provide accurate, current, and complete information when registering and to keep it up to date,
          including your business name, contact details, and billing information.
        </Clause>
        <Clause n="3.3">
          You are responsible for maintaining the confidentiality of all login credentials, PINs, and access devices
          associated with your Account, and for all activity that occurs under your Account, whether or not authorised
          by you. You must notify us promptly at <Mail /> if you become aware of any unauthorised access or security
          breach.
        </Clause>
        <Clause n="3.4">
          You are responsible for the acts and omissions of your Authorised Users, for assigning them appropriate roles
          and permissions, and for removing access promptly when it is no longer required.
        </Clause>
      </>
    ),
  },
  {
    id: "services",
    heading: "The Services",
    body: (
      <>
        <Clause n="4.1">
          Subject to these Terms and payment of the applicable Fees, we grant you a limited, non-exclusive,
          non-transferable, non-sublicensable right during your Subscription to access and use the Services for your
          internal business purposes.
        </Clause>
        <Clause n="4.2">
          The Services are provided as software-as-a-service. Features may vary by product, plan, and region. We may
          add, modify, or remove features from time to time to improve the Services, respond to legal or security
          requirements, or reflect changes in technology. Where a change materially reduces the core functionality of a
          paid Subscription, we will give you reasonable advance notice.
        </Clause>
        <Clause n="4.3">
          The Services are tools to help you run your business. You remain solely responsible for your business
          operations, including pricing, bookings, inventory, staffing, payroll, tax filings, accounting, and compliance
          with licensing, hospitality, consumer protection, and employment laws that apply to you. Reports, totals, and
          calculations produced by the Services should be reviewed by you or your professional advisers before you rely
          on them for statutory, tax, or financial purposes.
        </Clause>
        <Clause n="4.4">
          Hotel and business websites and storefronts published through the Services are published under your name and
          brand. You are responsible for their content, the accuracy of the prices, availability, and policies shown on
          them, and for the terms you offer your End Users.
        </Clause>
      </>
    ),
  },
  {
    id: "trials",
    heading: "Free trials and free plans",
    body: (
      <>
        <Clause n="5.1">
          We may offer a free trial of the HMS (currently 14 days) or a free plan for XYVOO Storefront. Trials and free
          plans are provided &quot;as is&quot;, may be subject to usage limits, and may be modified or withdrawn at any
          time.
        </Clause>
        <Clause n="5.2">
          At the end of a free trial, access to the Services will be suspended unless you subscribe to a paid plan.
          Customer Data entered during a trial is preserved in accordance with section 10 and is restored when you
          subscribe.
        </Clause>
        <Clause n="5.3">
          Free Storefront plans may be subject to a platform fee on each order processed through the storefront, as
          shown on our{" "}
          <Link href="/pricing" className={LINK}>
            pricing page
          </Link>{" "}
          at the time the order is placed.
        </Clause>
      </>
    ),
  },
  {
    id: "fees",
    heading: "Subscriptions, fees, and billing",
    body: (
      <>
        <Clause n="6.1">
          Fees are set out on our pricing page or in an order form agreed with you. Unless otherwise stated, Fees are
          quoted and billed in Nigerian Naira (NGN) and are exclusive of value added tax, withholding tax, and other
          applicable taxes, which you are responsible for paying.
        </Clause>
        <Clause n="6.2">
          Subscriptions are billed in advance for the billing cycle you choose (for example monthly, quarterly, or
          yearly) and renew automatically at the end of each cycle for the same period unless cancelled before the
          renewal date.
        </Clause>
        <Clause n="6.3">
          Payments for Subscriptions are processed by third-party payment processors, such as Paystack. By providing a
          payment method you authorise us and our processor to charge the applicable Fees to it. We do not store full
          card numbers.
        </Clause>
        <Clause n="6.4">
          If you change your plan or billing cycle during a cycle, any difference in Fees will be prorated and applied
          as shown in your Account billing settings.
        </Clause>
        <Clause n="6.5">
          If a payment fails or is overdue, we will notify you and may retry the charge. If the amount remains unpaid
          after a grace period stated in the notice, we may suspend access to the Services until payment is received.
          Suspension for non-payment does not delete your Customer Data.
        </Clause>
        <Clause n="6.6">
          We may change our Fees by giving you at least thirty (30) days&apos; notice. Changes take effect from the start
          of your next billing cycle after the notice period. If you do not agree to a change, you may cancel before it
          takes effect.
        </Clause>
        <Clause n="6.7">
          An invoice or receipt is generated for each payment and is available in your Account billing history.
        </Clause>
      </>
    ),
  },
  {
    id: "cancellation",
    heading: "Cancellation and refunds",
    body: (
      <>
        <Clause n="7.1">
          You may cancel your Subscription at any time from your Account settings or by contacting us. Cancellation
          takes effect at the end of the current billing cycle, and you will continue to have access until then.
        </Clause>
        <Clause n="7.2">
          Except where required by Applicable Law or expressly stated otherwise, Fees are non-refundable. We may, at
          our discretion, consider a refund of the unused portion of a prepaid billing period where cancellation occurs
          early in that period. Refund requests should be sent to <Mail />.
        </Clause>
      </>
    ),
  },
  {
    id: "end-user-payments",
    heading: "Payments between you and your guests or customers",
    body: (
      <>
        <Clause n="8.1">
          XYVOO is not a party to any transaction between you and your End Users, including room bookings, food and
          beverage orders, storefront purchases, deposits, and refunds. You are the merchant of record and are solely
          responsible for those transactions, including delivering the goods and services you sell, handling disputes
          and chargebacks, issuing refunds, and charging and remitting applicable taxes.
        </Clause>
        <Clause n="8.2">
          The HMS records payments that you take from your guests (for example by cash, bank transfer, or your own
          point-of-sale terminal). It does not itself collect or hold those funds. You are responsible for ensuring
          that the payments you record are accurate.
        </Clause>
        <Clause n="8.3">
          Where you connect a third-party payment provider to your storefront or website, your use of that provider is
          governed by its own terms, and funds are settled to you by that provider, not by XYVOO. We are not
          responsible for the acts, omissions, fees, or availability of any payment provider.
        </Clause>
      </>
    ),
  },
  {
    id: "acceptable-use",
    heading: "Your responsibilities and acceptable use",
    body: (
      <>
        <Clause n="9.1">You agree that you and your Authorised Users will not:</Clause>
        <ul className="list-disc pl-5 space-y-1">
          <li>use the Services in breach of Applicable Law or to facilitate any unlawful, fraudulent, or deceptive activity;</li>
          <li>sell or advertise goods or services that are illegal, counterfeit, or prohibited by our payment providers;</li>
          <li>upload or transmit content that infringes intellectual property or privacy rights, or that is defamatory, obscene, hateful, or harmful;</li>
          <li>upload viruses, malware, or other malicious code, or interfere with the integrity, security, or performance of the Services;</li>
          <li>attempt to gain unauthorised access to the Services, other accounts, or our systems, or probe, scan, or test their vulnerability without our written consent;</li>
          <li>copy, modify, reverse engineer, decompile, or create derivative works of the Services, except to the extent permitted by Applicable Law;</li>
          <li>resell, sublicense, rent, or otherwise make the Services available to third parties other than your Authorised Users, unless agreed in writing;</li>
          <li>use automated means to scrape, extract, or overload the Services, or use the Services to build a competing product; or</li>
          <li>send unsolicited marketing communications to End Users without the consent required by Applicable Law.</li>
        </ul>
        <Clause n="9.2">
          You are responsible for obtaining all notices, consents, and permissions required under Applicable Law to
          collect and process End User information through the Services, including guest identity documents,
          contact details, and payment records.
        </Clause>
      </>
    ),
  },
  {
    id: "customer-data",
    heading: "Customer Data and data protection",
    body: (
      <>
        <Clause n="10.1">
          As between you and XYVOO, you own all Customer Data. You grant us a non-exclusive, worldwide, royalty-free
          licence to host, store, process, transmit, and display Customer Data solely as necessary to provide, secure,
          support, and improve the Services and as otherwise permitted by these Terms.
        </Clause>
        <Clause n="10.2">
          In respect of personal data within Customer Data, you act as the data controller and XYVOO acts as a data
          processor on your behalf. We will process such personal data only on your documented instructions (which
          include these Terms and your use of the Services), keep it confidential, apply appropriate technical and
          organisational security measures, and assist you, where reasonable, in meeting your obligations under
          applicable data protection laws, including the Nigeria Data Protection Act 2023, the Kenya Data Protection
          Act 2019, and the UK General Data Protection Regulation, as applicable.
        </Clause>
        <Clause n="10.3">
          We will notify you without undue delay after becoming aware of a personal data breach affecting Customer
          Data.
        </Clause>
        <Clause n="10.4">
          We may use sub-processors (such as hosting, database, authentication, email, and payment providers) to
          deliver the Services, and we remain responsible for their performance of our obligations. Our handling of
          personal data for our own purposes is described in our{" "}
          <Link href="/privacy" className={LINK}>
            Privacy Policy
          </Link>
          .
        </Clause>
        <Clause n="10.5">
          We may create aggregated or de-identified data derived from use of the Services that does not identify you or
          any individual, and use it to operate, analyse, and improve the Services.
        </Clause>
        <Clause n="10.6">
          You may export Customer Data using the export tools available in the Services. On cancellation or suspension,
          Customer Data is retained so that you may reactivate your Account, unless you send us a written request for
          deletion, in which case we will delete it within a reasonable period, except where retention is required by
          Applicable Law. You are responsible for keeping your own backups of any Customer Data you need.
        </Clause>
      </>
    ),
  },
  {
    id: "third-party",
    heading: "Third-party services and integrations",
    body: (
      <>
        <Clause n="11.1">
          The Services may integrate with or link to third-party products and services, such as payment providers,
          accounting software, channel managers, online travel agencies, door-lock systems, messaging providers, and
          sign-in providers (&quot;Third-Party Services&quot;).
        </Clause>
        <Clause n="11.2">
          Your use of any Third-Party Service is governed solely by the terms between you and its provider. By enabling
          an integration you authorise us to exchange Customer Data with that provider as needed for the integration to
          function. We do not control and are not responsible for Third-Party Services, and we do not guarantee that any
          integration will remain available.
        </Clause>
      </>
    ),
  },
  {
    id: "intellectual-property",
    heading: "Intellectual property",
    body: (
      <>
        <Clause n="12.1">
          XYVOO and its licensors own all rights, title, and interest, including all intellectual property rights, in
          and to the Services, the underlying software, designs, templates, documentation, and the XYVOO name and logos.
          Except for the limited rights expressly granted in these Terms, no rights are transferred to you.
        </Clause>
        <Clause n="12.2">
          You retain ownership of your trade marks, logos, images, and other content you upload. You grant us a licence
          to use them as needed to provide the Services, including to display them on your hotel website or storefront.
          You confirm that you have all rights needed to grant that licence.
        </Clause>
        <Clause n="12.3">
          With your prior consent, we may identify you as a customer of XYVOO in our marketing materials. You may
          withdraw that consent at any time by contacting us.
        </Clause>
      </>
    ),
  },
  {
    id: "feedback",
    heading: "Feedback",
    body: (
      <p>
        If you provide suggestions, ideas, or other feedback about the Services, you grant us a perpetual, irrevocable,
        royalty-free licence to use and incorporate that feedback without obligation to you.
      </p>
    ),
  },
  {
    id: "confidentiality",
    heading: "Confidentiality",
    body: (
      <p>
        Each party may receive non-public information from the other that is marked as confidential or would
        reasonably be understood to be confidential. The receiving party will use such information only to perform its
        obligations or exercise its rights under these Terms, will protect it with at least reasonable care, and will
        not disclose it except to its personnel and advisers who need to know it and are bound by similar obligations,
        or where required by law. These obligations do not apply to information that is or becomes public through no
        fault of the receiving party, was already lawfully known to it, or is independently developed.
      </p>
    ),
  },
  {
    id: "availability",
    heading: "Availability, support, and maintenance",
    body: (
      <>
        <Clause n="15.1">
          We use commercially reasonable efforts to keep the Services available and to perform scheduled maintenance at
          times that minimise disruption. The Services may occasionally be unavailable because of maintenance, updates,
          failures of Third-Party Services or telecommunications networks, or events beyond our reasonable control.
        </Clause>
        <Clause n="15.2">
          Certain features are designed to continue working with limited functionality while offline and to synchronise
          when connectivity is restored. We do not guarantee that data entered offline will synchronise if the device
          is lost, reset, or its local storage is cleared before synchronisation completes.
        </Clause>
        <Clause n="15.3">
          Support is provided through the channels described on our website during the hours stated there. Any service
          level commitments apply only if agreed in a separate written agreement.
        </Clause>
      </>
    ),
  },
  {
    id: "termination",
    heading: "Suspension and termination",
    body: (
      <>
        <Clause n="16.1">
          We may suspend or restrict access to all or part of the Services immediately if we reasonably believe that
          (a) you have materially breached these Terms, including section 9; (b) your use poses a security risk or may
          harm the Services, us, or others; (c) Fees are overdue as described in section 6.5; or (d) suspension is
          required by Applicable Law or a lawful request from an authority. Where practical, we will give you notice and
          an opportunity to remedy the issue first.
        </Clause>
        <Clause n="16.2">
          Either party may terminate these Terms by written notice if the other party materially breaches them and
          fails to remedy the breach within thirty (30) days of receiving notice, or becomes insolvent, enters
          liquidation, or ceases to carry on business.
        </Clause>
        <Clause n="16.3">
          On termination, your right to access the Services ends, and any Fees accrued up to the termination date
          become immediately payable. Sections that by their nature should survive termination, including sections 8,
          10.6, 12, 14, 17, 18, 19, 21, and 22, will survive.
        </Clause>
      </>
    ),
  },
  {
    id: "disclaimers",
    heading: "Disclaimers",
    body: (
      <p className="uppercase text-[13px] tracking-wide">
        To the maximum extent permitted by Applicable Law, the Services are provided &quot;as is&quot; and &quot;as
        available&quot;. XYVOO makes no warranties, whether express, implied, statutory, or otherwise, including any
        implied warranties of merchantability, fitness for a particular purpose, title, non-infringement, or that the
        Services will be uninterrupted, error-free, or completely secure, or that they will meet your specific
        requirements. Nothing in these Terms excludes any warranty or right that cannot lawfully be excluded.
      </p>
    ),
  },
  {
    id: "liability",
    heading: "Limitation of liability",
    body: (
      <>
        <Clause n="18.1">
          To the maximum extent permitted by Applicable Law, neither party will be liable to the other for any
          indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, revenue,
          business, goodwill, or anticipated savings, or loss or corruption of data, however arising, even if advised of
          the possibility of such loss.
        </Clause>
        <Clause n="18.2">
          To the maximum extent permitted by Applicable Law, XYVOO&apos;s total aggregate liability arising out of or
          relating to these Terms or the Services will not exceed the total Fees paid by you to XYVOO in the twelve (12)
          months immediately preceding the event giving rise to the claim. For free trials and free plans, our total
          liability will not exceed one hundred thousand Nigerian Naira (NGN 100,000).
        </Clause>
        <Clause n="18.3">
          Nothing in these Terms limits or excludes liability for death or personal injury caused by negligence, for
          fraud or fraudulent misrepresentation, for your payment obligations, for your indemnity obligations, or for
          any other liability that cannot be limited or excluded under Applicable Law.
        </Clause>
      </>
    ),
  },
  {
    id: "indemnity",
    heading: "Indemnity",
    body: (
      <p>
        You will defend, indemnify, and hold harmless XYVOO, its affiliates, and their officers, directors, employees,
        and agents from and against any claims, losses, liabilities, damages, fines, costs, and expenses (including
        reasonable legal fees) arising out of or relating to (a) your Customer Data or other content; (b) your
        transactions with or obligations to your End Users; (c) your breach of these Terms or Applicable Law; or (d)
        the acts or omissions of your Authorised Users.
      </p>
    ),
  },
  {
    id: "changes",
    heading: "Changes to these Terms",
    body: (
      <p>
        We may update these Terms from time to time. We will post the updated Terms on this page with a revised
        effective date and, for material changes, notify you by email or through the Services at least thirty (30)
        days before they take effect. Your continued use of the Services after the changes take effect constitutes
        acceptance of the updated Terms. If you do not agree, you must stop using the Services and may cancel your
        Subscription.
      </p>
    ),
  },
  {
    id: "governing-law",
    heading: "Governing law and dispute resolution",
    body: (
      <>
        <Clause n="21.1">
          These Terms and any dispute or claim arising out of or in connection with them are governed by the laws of the
          Federal Republic of Nigeria.
        </Clause>
        <Clause n="21.2">
          The parties will first try in good faith to resolve any dispute through negotiation between senior
          representatives within thirty (30) days of written notice of the dispute.
        </Clause>
        <Clause n="21.3">
          If the dispute is not resolved within that period, it will be referred to and finally resolved by arbitration
          under the Arbitration and Mediation Act 2023 before a sole arbitrator. The seat of arbitration will be Lagos,
          Nigeria, and the language of the arbitration will be English. Nothing in this section prevents either party
          from seeking urgent injunctive or interim relief from a court of competent jurisdiction.
        </Clause>
      </>
    ),
  },
  {
    id: "general",
    heading: "General",
    body: (
      <>
        <Clause n="22.1">
          <strong>Entire agreement.</strong> These Terms, together with the Privacy Policy and any order form or written
          agreement signed by both parties, constitute the entire agreement between you and XYVOO concerning the
          Services. If there is a conflict, a signed written agreement prevails over these Terms.
        </Clause>
        <Clause n="22.2">
          <strong>Assignment.</strong> You may not assign or transfer these Terms without our prior written consent. We
          may assign these Terms to an affiliate or in connection with a merger, acquisition, or sale of all or
          substantially all of our assets.
        </Clause>
        <Clause n="22.3">
          <strong>Force majeure.</strong> Neither party is liable for any delay or failure to perform (other than payment
          obligations) caused by events beyond its reasonable control, including natural disasters, epidemics, war,
          civil unrest, strikes, acts of government, power or internet failures, and failures of third-party hosting
          providers.
        </Clause>
        <Clause n="22.4">
          <strong>Severability.</strong> If any provision of these Terms is held invalid or unenforceable, it will be
          enforced to the maximum extent permissible and the remaining provisions will remain in full force and effect.
        </Clause>
        <Clause n="22.5">
          <strong>No waiver.</strong> A failure or delay in exercising any right under these Terms does not waive that
          right.
        </Clause>
        <Clause n="22.6">
          <strong>Relationship.</strong> The parties are independent contractors. Nothing in these Terms creates a
          partnership, joint venture, agency, or employment relationship.
        </Clause>
        <Clause n="22.7">
          <strong>Notices.</strong> We may give notices to the email address associated with your Account or through
          the Services. You must send legal notices to us at <Mail />.
        </Clause>
        <Clause n="22.8">
          <strong>Language.</strong> These Terms are written in English. Any translation is provided for convenience
          only, and the English version prevails.
        </Clause>
      </>
    ),
  },
  {
    id: "contact",
    heading: "Contact us",
    body: (
      <p>
        If you have any questions about these Terms, please contact XYVOO Technologies Ltd at <Mail />.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <WebsiteLayout>
      <main className="pt-28 pb-16 px-4 bg-slate-50 min-h-screen">
        <section className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 space-y-8">
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">Terms and Conditions</h1>
            <p className="text-sm text-slate-500">Effective date: {EFFECTIVE_DATE}</p>
            <p className="text-sm text-slate-600 leading-relaxed">
              Please read these Terms carefully before using the XYVOO Hotel Management System, XYVOO Storefront, or
              any related service. They explain your rights and obligations, how billing works, and important
              limitations on our liability.
            </p>
          </div>

          <nav aria-label="Contents" className="rounded-xl bg-slate-50 border border-slate-200 p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Contents</p>
            <ol className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {SECTIONS.map((section, i) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="text-slate-700 hover:text-xyvoo-teal-product-hover">
                    {i + 1}. {section.heading}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {SECTIONS.map((section, i) => (
            <div key={section.id} id={section.id} className="space-y-2 scroll-mt-28">
              <h2 className="text-lg font-semibold text-slate-900">
                {i + 1}. {section.heading}
              </h2>
              <div className="text-sm text-slate-600 leading-relaxed space-y-2">{section.body}</div>
            </div>
          ))}
        </section>
      </main>
    </WebsiteLayout>
  );
}
