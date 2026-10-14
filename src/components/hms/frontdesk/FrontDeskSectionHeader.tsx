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
          className="text-sm font-medium text-slate-600"
        >
          {eyebrow}
        </p>
      ) : null}
      <h2 id={id} className="mt-0.5 font-heading text-lg font-semibold tracking-tight text-slate-900">
        {title}
      </h2>
    </header>
  );
}
