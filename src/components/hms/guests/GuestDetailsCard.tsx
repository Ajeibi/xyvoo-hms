"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, UserRound } from "lucide-react";
import { GuestDetailRows } from "@/components/hms/frontdesk/board/guest-details";
import { GuestForm } from "@/components/hms/guests/GuestForm";
import { HmsCard, HmsPill, hmsButton } from "@/components/hms/hms-ui";
import type { FrontDeskGuestInfo } from "@/lib/hms/front-desk-board";
import type { CompanyOption, GuestEditable } from "@/lib/hms/guest-fields";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-slate-100 py-2 sm:flex-row sm:gap-4 first:border-t-0">
      <dt className="w-44 shrink-0 text-sm text-slate-600">{label}</dt>
      <dd className="text-sm font-medium text-slate-900">{children}</dd>
    </div>
  );
}

/** The guest's details with a button to change them. */
export function GuestDetailsCard({
  slug,
  guestId,
  guest,
  editable,
  companies,
  companyName,
  companyId,
  address,
  language,
  tags,
  isVip,
  isDoNotWalk,
  canEdit,
  anonymised,
}: {
  slug: string;
  guestId: string;
  guest: FrontDeskGuestInfo;
  editable: GuestEditable;
  companies: CompanyOption[];
  companyName: string | null;
  companyId: string | null;
  address: { address: string | null; city: string | null; country: string | null };
  language: string | null;
  tags: string[];
  isVip: boolean;
  isDoNotWalk: boolean;
  canEdit: boolean;
  anonymised: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const place = [address.address, address.city, address.country].filter(Boolean).join(", ");

  return (
    <HmsCard
      id="guest-details"
      icon={UserRound}
      meaning="guests"
      title="Guest details"
      actions={
        <>
          {isVip ? <HmsPill tone="amber">VIP</HmsPill> : null}
          {isDoNotWalk ? <HmsPill tone="red">Do not walk</HmsPill> : null}
          {tags.map((tag) => (
            <HmsPill key={tag}>{tag}</HmsPill>
          ))}
          {anonymised ? <HmsPill tone="slate">Details erased</HmsPill> : null}
          {canEdit && !anonymised && !editing ? (
            <button type="button" className={hmsButton.small} onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" aria-hidden />
              Change details
            </button>
          ) : null}
        </>
      }
    >
      {editing ? (
        <GuestForm
          slug={slug}
          guestId={guestId}
          initial={editable}
          companies={companies}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            router.refresh();
          }}
        />
      ) : (
        <dl>
          <GuestDetailRows guest={guest} />
          <Row label="Address">{place || <span className="text-slate-500">Not set</span>}</Row>
          <Row label="Language">{language || <span className="text-slate-500">Not set</span>}</Row>
          <Row label="Company">
            {companyName && companyId ? (
              <Link href={`/hms/${slug}/guests/companies/${companyId}`} className="text-blue-700 hover:underline">
                {companyName}
              </Link>
            ) : (
              <span className="text-slate-500">None</span>
            )}
          </Row>
        </dl>
      )}
    </HmsCard>
  );
}
