import type { FrontDeskGuestInfo } from "@/lib/hms/front-desk-board";

export function GuestDetailBlock({ guest }: { guest: FrontDeskGuestInfo }) {
  return (
    <div className="space-y-1.5 text-left text-sm">
      <p className="font-semibold">{guest.displayName}</p>
      <p>{guest.phone}</p>
      {guest.whatsapp ? <p>WhatsApp: {guest.whatsapp}</p> : null}
      <p>{guest.email}</p>
      <p>
        {guest.nationality} · {guest.idType}: {guest.idNumber}
      </p>
      <p>
        DOB {guest.dateOfBirth} · ID expires {guest.idExpiryDate}
      </p>
      {guest.gender ? <p className="capitalize">{guest.gender}</p> : null}
      <p className="text-slate-300">Prefers {guest.preferredChannel}</p>
      {guest.tags.length > 0 ? (
        <p className="flex flex-wrap gap-1 pt-1">
          {guest.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-slate-700 px-2 py-0.5 text-[10px] uppercase">
              {tag}
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

export function GuestDetailRows({ guest }: { guest: FrontDeskGuestInfo }) {
  return (
    <>
      <DetailRow label="Full name" value={guest.displayName} />
      <DetailRow label="Phone" value={guest.phone} />
      {guest.whatsapp ? <DetailRow label="WhatsApp" value={guest.whatsapp} /> : null}
      <DetailRow label="Email" value={guest.email} />
      <DetailRow label="Nationality" value={guest.nationality} />
      <DetailRow label="ID type" value={guest.idType} />
      <DetailRow label="ID number" value={guest.idNumber} />
      <DetailRow label="ID expiry" value={guest.idExpiryDate} />
      <DetailRow label="Date of birth" value={guest.dateOfBirth} />
      {guest.gender ? <DetailRow label="Gender" value={guest.gender} /> : null}
      <DetailRow label="Preferred contact" value={guest.preferredChannel} />
      {guest.tags.length > 0 ? (
        <DetailRow label="Tags" value={guest.tags.join(", ")} />
      ) : null}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-slate-50 py-2.5 last:border-0 sm:flex-row sm:justify-between sm:gap-6">
      <dt className="shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="text-sm font-medium break-words text-slate-900 sm:max-w-[65%] sm:text-right">{value}</dd>
    </div>
  );
}
