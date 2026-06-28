import WebsiteLayout from "@/components/website/WebsiteLayout";

export default function TermsPage() {
  return (
    <WebsiteLayout>
      <main className="pt-28 pb-16 px-4 bg-slate-50 min-h-screen">
        <section className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 space-y-4">
          <h1 className="text-2xl font-bold text-slate-900">Terms and Conditions</h1>
          <p className="text-sm text-slate-600">
            These terms govern your use of XYVOO services. By registering your hotel, you agree to our service rules,
            billing policies, and acceptable use requirements.
          </p>
          <p className="text-sm text-slate-600">
            This page is a placeholder and should be replaced with your full legal terms before production launch.
          </p>
        </section>
      </main>
    </WebsiteLayout>
  );
}
