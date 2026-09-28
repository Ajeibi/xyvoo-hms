import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, FileText } from "lucide-react";
import type { Metadata } from "next";
import { PdfViewer } from "@/components/website/PdfViewer";
import { RESOURCES, getResourceBySlug, getRelatedResources } from "@/constants/resources";

export function generateStaticParams() {
  return RESOURCES.map((r) => ({ slug: r.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resource = getResourceBySlug(slug);
  if (!resource) return {};
  return {
    title: `${resource.title} — XYVOO Resources`,
    description: resource.summary,
  };
}

export default async function ResourceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resource = getResourceBySlug(slug);
  if (!resource) notFound();

  const related = getRelatedResources(resource);
  const fileUrl = `/docs/${resource.file}`;

  return (
    <section className="bg-slate-50 pt-32 pb-20">
      <div className="mx-auto max-w-6xl px-6">
        <Link
          href="/resources"
          className="mb-8 flex w-fit items-center gap-2 text-sm font-semibold text-xyvoo-navy/60 transition-colors hover:text-xyvoo-blue"
        >
          <ArrowLeft className="h-4 w-4" /> Back to resources
        </Link>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_280px]">
          <div>
            <span className="mb-3 inline-block text-xs font-semibold uppercase tracking-wide text-xyvoo-blue">
              {resource.category}
            </span>
            <h1 className="mb-4 text-h1 font-black text-xyvoo-navy">{resource.title}</h1>
            <p className="mb-6 max-w-2xl text-p leading-relaxed text-xyvoo-navy/60">{resource.summary}</p>
            <div className="mb-8 flex flex-wrap items-center gap-3 text-xs text-xyvoo-navy/45">
              <span className="flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> PDF · {resource.pages} pages
              </span>
              <span>{resource.readTime} read</span>
              <span>{resource.date}</span>
              <span>{resource.audience}</span>
            </div>

            <PdfViewer fileUrl={fileUrl} title={resource.title} />
          </div>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            {related.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-6">
                <h3 className="mb-4 text-sm font-bold text-xyvoo-navy">Related Resources</h3>
                <ul className="flex flex-col gap-4">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <Link href={`/resources/${r.slug}`} className="group flex items-start gap-3">
                        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-xyvoo-blue/10">
                          <FileText className="h-4 w-4 text-xyvoo-blue" />
                        </span>
                        <span className="text-sm font-medium text-xyvoo-navy/80 transition-colors group-hover:text-xyvoo-blue">
                          {r.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/resources"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-xyvoo-blue"
                >
                  Browse all resources <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </aside>
        </div>
      </div>
    </section>
  );
}
