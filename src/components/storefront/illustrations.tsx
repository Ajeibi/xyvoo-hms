/**
 * Small friendly drawings for empty pages. They take their accent from the text colour of the
 * element around them (`currentColor`), so one drawing works in any meaning colour. Lines are
 * dark slate and the soft background is the accent at low opacity. Decorative only: the words
 * beside them carry the meaning, so they're hidden from screen readers.
 */
export type IllustrationName = "box" | "basket" | "people" | "star" | "tag" | "megaphone" | "chart" | "truck" | "page" | "bell";

const LINE = "#334155";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 160 120" width="160" height="120" aria-hidden focusable="false" className="h-auto w-36 sm:w-40">
      <ellipse cx="80" cy="66" rx="68" ry="46" fill="currentColor" opacity="0.12" />
      <circle cx="22" cy="28" r="3" fill="currentColor" opacity="0.5" />
      <circle cx="140" cy="22" r="4" fill="currentColor" opacity="0.35" />
      <circle cx="146" cy="92" r="2.5" fill="currentColor" opacity="0.5" />
      <g fill="none" stroke={LINE} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </g>
    </svg>
  );
}

const drawings: Record<IllustrationName, React.ReactNode> = {
  // An open parcel.
  box: (
    <>
      <path d="M48 52 80 40l32 12v36L80 100 48 88z" fill="#fff" />
      <path d="M48 52l32 12 32-12M80 64v36" />
      <path d="M48 52 38 38l32-12 10 14M112 52l10-14-32-12-10 14" fill="currentColor" fillOpacity="0.25" />
      <path d="M60 80l8 3" />
    </>
  ),
  // A shopping basket with something left in it.
  basket: (
    <>
      <path d="M44 56h72l-8 40H52z" fill="#fff" />
      <path d="M58 56 70 34M102 56 90 34" />
      <path d="M64 70v14M80 70v14M96 70v14" />
      <circle cx="74" cy="48" r="7" fill="currentColor" fillOpacity="0.35" />
    </>
  ),
  // Two people side by side.
  people: (
    <>
      <circle cx="64" cy="48" r="11" fill="#fff" />
      <path d="M42 94c0-14 10-24 22-24s22 10 22 24" fill="#fff" />
      <circle cx="98" cy="52" r="10" fill="currentColor" fillOpacity="0.3" />
      <path d="M82 94c1-12 8-20 16-20 10 0 20 8 20 20" fill="currentColor" fillOpacity="0.3" />
    </>
  ),
  // A star with a speech bubble.
  star: (
    <>
      <path d="M44 40h72a6 6 0 0 1 6 6v34a6 6 0 0 1-6 6H76l-14 12V86H44a6 6 0 0 1-6-6V46a6 6 0 0 1 6-6z" fill="#fff" />
      <path d="m80 48 5 10 11 2-8 8 2 11-10-5-10 5 2-11-8-8 11-2z" fill="currentColor" fillOpacity="0.45" />
    </>
  ),
  // A price tag.
  tag: (
    <>
      <path d="M46 42h34l36 36-28 28-42-42z" fill="#fff" />
      <circle cx="62" cy="56" r="5" />
      <path d="M82 76l14 14M74 84l10 10" stroke="currentColor" strokeOpacity="0.8" />
    </>
  ),
  // A megaphone.
  megaphone: (
    <>
      <path d="M50 62h14l40-20v52L64 74H50z" fill="#fff" />
      <path d="M58 74l6 20h8l-4-20" />
      <path d="M114 58c5 3 5 17 0 20" stroke="currentColor" />
      <path d="M122 50c10 6 10 30 0 36" stroke="currentColor" strokeOpacity="0.6" />
    </>
  ),
  // A rising bar chart.
  chart: (
    <>
      <path d="M40 98h84" />
      <rect x="50" y="72" width="14" height="26" rx="3" fill="#fff" />
      <rect x="73" y="56" width="14" height="42" rx="3" fill="currentColor" fillOpacity="0.3" />
      <rect x="96" y="40" width="14" height="58" rx="3" fill="#fff" />
    </>
  ),
  // A delivery van.
  truck: (
    <>
      <path d="M36 50h52v38H36z" fill="#fff" />
      <path d="M88 62h18l12 14v12H88z" fill="currentColor" fillOpacity="0.25" />
      <circle cx="54" cy="92" r="7" fill="#fff" />
      <circle cx="104" cy="92" r="7" fill="#fff" />
    </>
  ),
  // A web page.
  page: (
    <>
      <rect x="40" y="34" width="80" height="62" rx="6" fill="#fff" />
      <path d="M40 46h80" />
      <rect x="50" y="56" width="26" height="30" rx="3" fill="currentColor" fillOpacity="0.3" stroke="none" />
      <path d="M84 60h26M84 70h22M84 80h16" />
    </>
  ),
  // A bell.
  bell: (
    <>
      <path d="M58 82V64a22 22 0 0 1 44 0v18l8 8H50z" fill="#fff" />
      <path d="M72 96a8 8 0 0 0 16 0" />
      <circle cx="104" cy="44" r="7" fill="currentColor" fillOpacity="0.5" stroke="none" />
    </>
  ),
};

export function Illustration({ name }: { name: IllustrationName }) {
  return <Frame>{drawings[name]}</Frame>;
}
