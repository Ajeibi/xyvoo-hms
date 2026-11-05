"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { HmsCard, HmsEmptyState, HmsPage, HmsPageHeader, HmsPill, hmsButton } from "@/components/hms/hms-ui";
import { HmsSectionIntro } from "@/components/hms/hms-ui-client";
import { GuestsNav } from "@/components/hms/guests/GuestsNav";
import { CompanyForm, EMPTY_COMPANY } from "@/components/hms/guests/CompanyForm";
import { formatBoardDateTime } from "@/lib/hms/front-desk-board";
import { formatPricingAmount } from "@/lib/hms/room-pricing";
import type { CompanyListRow } from "@/lib/hms/guest-companies";

export function CompaniesClient({ slug, companies, canEdit, currency }: { slug: string; companies: CompanyListRow[]; canEdit: boolean; currency: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const money = (n: number) => formatPricingAmount(n, currency);

  return (
    <HmsPage wide>
      <GuestsNav slug={slug} />
      <HmsPageHeader
        eyebrow="Guests"
        meaning="guests"
        title="Companies"
        description="The firms whose staff stay with you, with their guests, stays and what they owe."
        actions={
          canEdit ? (
            <button type="button" className={hmsButton.primary} onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
              <Plus className="h-4 w-4" aria-hidden />
              Add a company
            </button>
          ) : undefined
        }
      />
      <HmsSectionIntro
        id="guest-companies"
        meaning="guests"
        art="people"
        title="Know your corporate accounts"
        points={[
          "Companies here are the same customers you bill in Accounts, so there is one list, not two.",
          "Link a guest to their company from the guest's profile. Their stays then show up on the company's page.",
        ]}
      />

      {adding ? (
        <HmsCard id="company-add" icon={Building2} meaning="guests" title="Add a company">
          <CompanyForm
            slug={slug}
            initial={EMPTY_COMPANY}
            onCancel={() => setAdding(false)}
            onSaved={(id) => {
              setAdding(false);
              router.push(`/hms/${slug}/guests/companies/${id}`);
            }}
          />
        </HmsCard>
      ) : null}

      <HmsCard id="companies-list" icon={Building2} meaning="guests" title="Your companies" description={`${companies.length} on record.`} flush>
        {companies.length === 0 ? (
          <HmsEmptyState bare icon={Building2} meaning="guests" title="No companies yet" description="Add the firms you bill or take bookings from, then link their staff on the guest profiles." />
        ) : (
          <>
          <ul className="divide-y divide-slate-100 md:hidden">
            {companies.map((c) => (
              <li key={c.id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link href={`/hms/${slug}/guests/companies/${c.id}`} className="font-semibold text-blue-700 hover:underline">
                      {c.name}
                    </Link>
                    <p className="mt-0.5 truncate text-sm text-slate-600">{c.contactName ?? c.email ?? c.phone ?? "No contact"}</p>
                  </div>
                  {c.status !== "active" ? <HmsPill>Inactive</HmsPill> : null}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-slate-50 p-3 text-sm">
                  <div>
                    <dt className="text-xs font-medium text-slate-600">Guests</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{c.guestCount}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-600">Stays</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{c.stays}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-600">Billed</dt>
                    <dd className="mt-0.5 font-semibold tabular-nums text-slate-900">{money(c.spend)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-slate-600">Owes you</dt>
                    <dd className={`mt-0.5 font-semibold tabular-nums ${c.owed > 0 ? "text-amber-800" : "text-slate-900"}`}>
                      {c.owed > 0 ? money(c.owed) : "—"}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="text-xs font-medium text-slate-600">Last stay</dt>
                    <dd className="mt-0.5 text-slate-900">{c.lastStayAt ? formatBoardDateTime(c.lastStayAt) : "—"}</dd>
                  </div>
                </dl>
                <Link href={`/hms/${slug}/guests/companies/${c.id}`} className={`${hmsButton.secondary} w-full`}>
                  Open<span className="sr-only"> {c.name}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <caption className="sr-only">Companies</caption>
              <thead className="bg-slate-50 text-slate-700">
                <tr>
                  <th scope="col" className="py-3 pl-6 pr-4 font-semibold">Company</th>
                  <th scope="col" className="py-3 pr-4 font-semibold">Contact</th>
                  <th scope="col" className="py-3 pr-4 text-right font-semibold">Guests</th>
                  <th scope="col" className="py-3 pr-4 text-right font-semibold">Stays</th>
                  <th scope="col" className="py-3 pr-4 text-right font-semibold">Billed</th>
                  <th scope="col" className="py-3 pr-4 text-right font-semibold">Owes you</th>
                  <th scope="col" className="py-3 pr-6 font-semibold">Last stay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td className="py-3 pl-6 pr-4">
                      <Link href={`/hms/${slug}/guests/companies/${c.id}`} className="font-medium text-blue-700 hover:underline">
                        {c.name}
                      </Link>
                      {c.status !== "active" ? <span className="ml-2"><HmsPill>Inactive</HmsPill></span> : null}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{c.contactName ?? c.email ?? c.phone ?? "—"}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{c.guestCount}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{c.stays}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{money(c.spend)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">{c.owed > 0 ? <span className="font-medium text-amber-800">{money(c.owed)}</span> : "—"}</td>
                    <td className="whitespace-nowrap py-3 pr-6 text-slate-700">{c.lastStayAt ? formatBoardDateTime(c.lastStayAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </HmsCard>
    </HmsPage>
  );
}
