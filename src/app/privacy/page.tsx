import WebsiteLayout from "@/components/website/WebsiteLayout";

export default function PrivacyPage() {
  return (
    <WebsiteLayout>
      <main className="pt-28 pb-16 px-4 bg-slate-50 min-h-screen">
        <section className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 space-y-4">
          <h1 className="text-2xl font-bold text-slate-900">Privacy Policy</h1>
          <p className="text-sm text-slate-600">This page is a placeholder privacy policy for registration consent links. Replace with your legal policy before production launch.</p>
        </section>
      </main>
    </WebsiteLayout>
  );
}
