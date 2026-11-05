"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Banknote, BedDouble, Building2, Moon, Pencil, Users, Wallet } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsPill, HmsStatStrip, HmsStatTile, hmsButton } from "@/components/hms/hms-ui";
import { GuestsNav } from "@/components/hms/guests/GuestsNav";
import { CompanyForm, type CompanyDraft } from "@/components/hms/guests/CompanyForm";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { CompanyProfile } from "@/lib/hms/guest-companies";

const words = (s: string) => {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-slate-100 py-2 first:border-t-0 sm:flex-row sm:gap-4">
      <dt className="w-44 shrink-0 text-sm text-slate-600">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{children || <span className="font-normal text-slate-500">Not set</span>}</dd>
    </div>
  );
}

export function CompanyProfileClient({ slug, company, canEdit, currency }: { slug: string; company: CompanyProfile; canEdit: boolean; currency: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const money = (n: number) => formatPricingAmount(n, currency);
  const draft: CompanyDraft = {
    name: company.name,
    contactName: company.contactName ?? "",
    phone: company.phone ?? "",
    email: company.email ?? "",
    address: company.address ?? "",
    paymentTerms: company.paymentTerms ?? "",
    taxId: company.taxId ?? "",
    industry: company.industry ?? "",
    accountManager: company.accountManager ?? "",
    negotiatedRateNote: company.negotiatedRateNote ?? "",
    notes: company.notes ?? "",
  };

  return (
    <HmsPage wide>
      <Link href={`/hms/${slug}/guests/companies`} className="inline-flex items-center gap-2 rounded-lg text-sm font-medium text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to companies
      </Link>
      <GuestsNav slug={slug} />
      <HmsPageHeader eyebrow="Companies" meaning="guests" title={company.name} description="Their details, the guests who travel for them, and every stay." />

      <HmsStatStrip label="This company in figures" columns={4}>
        <HmsStatTile label="Guests" value={company.guests.length} icon={Users} meaning="guests" hint="Linked to this company" />
        <HmsStatTile label="Stays" value={company.totals.stays} icon={BedDouble} meaning="rooms" hint={`${company.totals.nights} nights in all`} />
        <HmsStatTile label="Billed" value={money(company.totals.spend)} icon={Banknote} meaning="money" hint="From their bills" />
        <HmsStatTile label="Owes you" value={money(company.totals.owed)} icon={Wallet} meaning="money" hint="Unpaid invoices in Accounts" />
      </HmsStatStrip>

      <HmsCard
        id="company-details"
        icon={Building2}
        meaning="guests"
        title="Company details"
        actions={
          <>
            {company.status !== "active" ? <HmsPill>Inactive</HmsPill> : null}
            {canEdit && !editing ? (
              <button type="button" className={hmsButton.small} onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" aria-hidden />
                Change details
              </button>
            ) : null}
          </>
        }
      >
        {editing ? (
          <CompanyForm
            slug={slug}
            companyId={company.id}
            initial={draft}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              router.refresh();
            }}
          />
        ) : (
          <dl>
            <Row label="Contact person">{company.contactName}</Row>
            <Row label="Phone">{company.phone}</Row>
            <Row label="Email">{company.email}</Row>
            <Row label="Address">{company.address}</Row>
            <Row label="Industry">{company.industry}</Row>
            <Row label="Our account manager">{company.accountManager}</Row>
            <Row label="Payment terms">{company.paymentTerms}</Row>
            <Row label="Credit limit">{company.creditLimit != null ? money(company.creditLimit) : null}</Row>
            <Row label="Tax ID">{company.taxId}</Row>
            <Row label="Agreed rates">{company.negotiatedRateNote}</Row>
            <Row label="Notes">{company.notes}</Row>
          </dl>
        )}
      </HmsCard>

      <HmsCard id="company-guests" icon={Users} meaning="guests" title="Their guests" description="Link a guest to this company from the guest's own page." flush>
        {company.guests.length === 0 ? (
          <HmsEmptyState bare icon={Users} meaning="guests" title="No guests linked yet" description="Open a guest, choose Change details, and pick this company." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-130 text-left text-sm">
              <caption className="sr-only">Guests linked to {company.name}</caption>
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th scope="col" className="py-3 pl-6 pr-4 font-semibold">Guest</th>
                  <th scope="col" className="py-3 pr-4 text-right font-semibold">Stays</th>
                  <th scope="col" className="py-3 pr-4 text-right font-semibold">Billed</th>
                  <th scope="col" className="py-3 pr-6 font-semibold">Last stay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {company.guests.map((g) => (
                  <tr key={g.id}>
                    <td className="py-3 pl-6 pr-4">
                      <Link href={`/hms/${slug}/guests/${g.id}`} className="font-medium text-blue-700 hover:underline">
                        {g.name}
                      </Link>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">{g.completedStays}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{money(g.spend)}</td>
                    <td className="whitespace-nowrap py-3 pr-6 text-slate-700">{g.lastStayAt ? formatBoardDateTime(g.lastStayAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>

      <HmsCard id="company-stays" icon={Moon} meaning="rooms" title="Stays" description="The latest 50, from their guests and from bills sent to the company." flush>
        {company.stays.length === 0 ? (
          <HmsEmptyState bare icon={BedDouble} meaning="rooms" title="No stays yet" description="Stays appear here once a linked guest books, or a bill is sent to this company." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-190 text-left text-sm">
              <caption className="sr-only">Stays for {company.name}</caption>
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th scope="col" className="py-3 pl-6 pr-4 font-semibold">Booking</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Guest</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Status</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Arrival</th>
                  <th scope="col" className="py-3 pr-4 text-right font-semibold">Nights</th>
                  <th scope="col" className="py-3 pr-6 text-right font-semibold">Billed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {company.stays.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap py-3 pl-6 pr-4 font-medium text-slate-900">{s.confirmationCode}</td>
                    <td className="py-3 pr-4">
                      {s.guestId ? (
                        <Link href={`/hms/${slug}/guests/${s.guestId}`} className="text-blue-700 hover:underline">
                          {s.guestName}
                        </Link>
                      ) : (
                        s.guestName
                      )}
                    </td>
                    <td className="py-3 pr-4">{words(s.status)}</td>
                    <td className="whitespace-nowrap py-3 pr-4 text-slate-700">{formatBoardDateTime(s.arrivalAt)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{s.nights}</td>
                    <td className="py-3 pr-6 text-right tabular-nums">{money(s.billed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </HmsCard>
    </HmsPage>
  );
}
