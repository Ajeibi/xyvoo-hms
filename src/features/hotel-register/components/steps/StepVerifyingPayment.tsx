export default function StepVerifyingPayment({ headingRef }: { headingRef?: React.Ref<HTMLHeadingElement> }) {
  return (
    <div role="status" className="space-y-4 py-6 text-center">
      <span
        aria-hidden
        className="mx-auto block h-12 w-12 rounded-full border-4 border-blue-100 border-t-xyvoo-blue animate-spin motion-reduce:animate-none"
      />
      <p className="text-sm font-bold uppercase tracking-wider text-xyvoo-blue-deep">XYVOO Hotel</p>
      <h1 ref={headingRef} tabIndex={-1} className="text-4xl font-bold leading-tight text-black focus:outline-none">
        Verifying your payment…
      </h1>
      <p className="text-base text-slate-700">Just a moment.</p>
    </div>
  );
}
