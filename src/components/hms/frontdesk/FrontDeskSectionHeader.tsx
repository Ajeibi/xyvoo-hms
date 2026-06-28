export function FrontDeskSectionHeader({
  id,
  eyebrow,
  title,
}: {
  id: string;
  eyebrow?: string;
  title: string;
}) {
  return (
    <header className="mb-5">
      {eyebrow ? (
        <p
          id={`${id}-eyebrow`}
          className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400"
        >
          {eyebrow}
        </p>
      ) : null}
      <h2 id={id} className="mt-2 text-lg font-semibold tracking-tight text-slate-900">
        {title}
      </h2>
    </header>
  );
}
