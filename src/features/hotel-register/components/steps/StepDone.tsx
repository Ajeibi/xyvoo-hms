import { CheckCircle2 } from "lucide-react";
import Image from "next/image";
import { LOGO_URL } from "@/constants/branding";

export default function StepDone() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-10 text-center">
      <Image src={LOGO_URL} alt="XYVOO" width={125} height={50} className="mx-auto mb-6" />
      <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
        <CheckCircle2 className="w-12 h-12 text-green-600" />
      </div>
      <h2 className="mb-2 text-2xl font-bold text-xyvoo-navy">You&apos;re all set!</h2>
      <p className="text-slate-500 text-sm mb-6">
        Your hotel account is ready. Sign in with the email and password you created during registration.
      </p>
      <div className="bg-blue-50 rounded-xl p-4 mb-6 text-left">
        <p className="text-xs text-slate-400 mb-2 font-semibold uppercase tracking-wider">Next steps</p>
        <ul className="text-sm text-slate-700 space-y-2">
          {["Sign in with your registration email and password", "Complete your HMS setup wizard", "Add your rooms and team", "Go live!"].map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 font-bold text-xyvoo-blue">{i + 1}.</span> {s}
            </li>
          ))}
        </ul>
      </div>
      <a
        href="/auth/login"
        className="block w-full rounded-xl bg-xyvoo-blue py-3.5 font-semibold text-white transition-all"
      >
        Sign in to your dashboard →
      </a>
    </div>
  );
}
