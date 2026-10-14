import { CheckCircle2 } from "lucide-react";
import { PRIMARY_BUTTON_CLASS } from "@/features/hotel-register/components/fields";

const NEXT_STEPS = [
  "Sign in with your registration email and password",
  "Complete your HMS setup wizard",
  "Add your rooms and team",
  "Go live!",
];

export default function StepDone({ headingRef }: { headingRef?: React.Ref<HTMLHeadingElement> }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50" aria-hidden>
          <CheckCircle2 className="h-8 w-8 text-emerald-700" />
        </span>
        <p className="pt-2 text-sm font-bold uppercase tracking-wider text-xyvoo-blue-deep">XYVOO Hotel</p>
        <h1 ref={headingRef} tabIndex={-1} className="text-4xl font-bold leading-tight text-black focus:outline-none">
          You&rsquo;re all set!
        </h1>
        <p className="text-base leading-relaxed text-black">
          Your hotel account is ready. Sign in with the email and password you created during registration.
        </p>
      </div>

      <section aria-labelledby="done-next-steps-title" className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 id="done-next-steps-title" className="text-base font-semibold text-slate-900">
          Next steps
        </h2>
        <ol className="mt-3 space-y-2 text-sm text-slate-700">
          {NEXT_STEPS.map((s, i) => (
            <li key={s} className="flex gap-3">
              <span
                aria-hidden
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-xyvoo-blue-deep"
              >
                {i + 1}
              </span>
              <span className="pt-0.5">{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="border-t border-slate-200 pt-6">
        <a href="/auth/login" className={PRIMARY_BUTTON_CLASS}>
          Sign in to your dashboard
        </a>
      </div>
    </div>
  );
}
