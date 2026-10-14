/**
 * Registration progress as small dots, as in the storefront setup: the current
 * step is a wider pill and finished steps are marked. Each dot has a 24px
 * target and a full label for screen readers.
 */
export default function StepIndicator({ step, labels }: { step: number; labels: string[] }) {
  return (
    <nav aria-label="Registration steps">
      <ol className="flex items-center gap-1">
        {labels.map((label, i) => {
          const current = i === step;
          const done = i < step;
          return (
            <li key={label}>
              <span
                className="flex h-6 min-w-6 items-center justify-center"
                aria-current={current ? "step" : undefined}
                title={label}
              >
                <span
                  aria-hidden
                  className={`block h-2 rounded-full transition-all motion-reduce:transition-none ${
                    current ? "w-6 bg-xyvoo-blue" : done ? "w-2 bg-xyvoo-blue/45" : "w-2 bg-slate-300"
                  }`}
                />
                <span className="sr-only">
                  Step {i + 1}: {label}
                  {current ? " (current step)" : done ? " (done)" : ""}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
