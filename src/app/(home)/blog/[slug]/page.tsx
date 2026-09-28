import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock, Download, FileText } from "lucide-react";
import type { Metadata } from "next";
import { BLOG_POSTS, getBlogPostBySlug, getRelatedBlogPosts } from "@/constants/blog";
import { getResourceBySlug } from "@/constants/resources";
import type { BlogBodyBlock } from "@/types/blog";

export function generateStaticParams() {
  return BLOG_POSTS.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) return {};
  return {
    title: `${post.title} — XYVOO Blog`,
    description: post.excerpt,
  };
}

function BodyBlock({ block, index }: { block: BlogBodyBlock; index: number }) {
  switch (block.type) {
    case "h2":
      return (
        <h2 key={index} className="mt-10 mb-4 text-h4 font-black text-xyvoo-navy">
          {block.text}
        </h2>
      );
    case "list":
      return (
        <ul key={index} className="my-5 flex flex-col gap-3">
          {block.items.map((item, i) => (
            <li key={i} className="flex items-start gap-3 text-p leading-relaxed text-slate-600">
              <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-xyvoo-blue" />
              {item}
            </li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote
          key={index}
          className="my-7 border-l-4 border-xyvoo-blue/30 pl-5 text-lg leading-relaxed text-xyvoo-navy/70 italic"
        >
          {block.text}
        </blockquote>
      );
    case "resource": {
      const resource = getResourceBySlug(block.slug);
      if (!resource) return null;
      return (
        <Link
          key={index}
          href={`/resources/${resource.slug}`}
          className="group my-8 flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-5 transition-colors hover:border-xyvoo-blue/30 hover:bg-white"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-xyvoo-blue/10">
            <FileText className="h-5 w-5 text-xyvoo-blue" />
          </span>
          <span className="flex-1">
            <span className="mb-0.5 block text-xs font-semibold uppercase tracking-wide text-xyvoo-blue">
              Free download
            </span>
            <span className="block font-bold text-xyvoo-navy">{resource.title}</span>
            <span className="mt-0.5 block text-xs text-xyvoo-navy/45">
              PDF · {resource.pages} pages · {resource.readTime} read
            </span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-xyvoo-navy px-4 py-2 text-sm font-semibold text-white transition-colors group-hover:bg-xyvoo-navy/90">
            <Download className="h-3.5 w-3.5" /> Get it
          </span>
        </Link>
      );
    }
    default:
      return (
        <p key={index} className="my-4 text-p leading-relaxed text-slate-600">
          {block.text}
        </p>
      );
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getBlogPostBySlug(slug);
  if (!post) notFound();

  const related = getRelatedBlogPosts(post);

  return (
    <article className="bg-white pt-32 pb-20">
      <div className="mx-auto max-w-7xl px-6">
        <Link
          href="/blog"
          className="mb-8 flex w-fit items-center gap-2 text-sm font-semibold text-xyvoo-navy/60 transition-colors hover:text-xyvoo-blue"
        >
          <ArrowLeft className="h-4 w-4" /> Back to blog
        </Link>

        <span className="mb-3 inline-block text-xs font-semibold uppercase tracking-wide text-xyvoo-blue">
          {post.category}
        </span>
        <h1 className="mb-5 max-w-3xl text-h1 font-black text-xyvoo-navy">{post.title}</h1>
        <div className="mb-10 flex flex-wrap items-center gap-3 text-xs text-xyvoo-navy/45">
          <span>{post.author}</span>
          <span className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> {post.readTime} read
          </span>
          <span>{post.date}</span>
        </div>

        <div className={`mb-10 h-72 rounded-2xl bg-gradient-to-br sm:h-80 md:h-96 ${post.color}`} />

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_280px]">
          <div className="max-w-3xl">
            {post.body.map((block, i) => (
              <BodyBlock key={i} block={block} index={i} />
            ))}
          </div>

          {related.length > 0 && (
            <aside className="lg:sticky lg:top-28 lg:self-start">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6">
                <h3 className="mb-4 text-sm font-bold text-xyvoo-navy">More from the blog</h3>
                <ul className="flex flex-col gap-4">
                  {related.map((r) => (
                    <li key={r.slug}>
                      <Link href={`/blog/${r.slug}`} className="group flex items-start gap-3">
                        <span className={`h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br ${r.color}`} />
                        <span className="text-sm font-medium text-xyvoo-navy/80 transition-colors group-hover:text-xyvoo-blue">
                          {r.title}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  href="/blog"
                  className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-xyvoo-blue"
                >
                  Browse all articles <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </aside>
          )}
        </div>
      </div>
    </article>
  );
}
