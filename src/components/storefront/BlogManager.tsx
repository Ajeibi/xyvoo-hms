"use client";

import { useEffect, useId, useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { isPostLive, slugifyTitle, type BlogBlock } from "@/lib/store/blog";
import type { BlogPost } from "@/lib/store/blog-server";
import { DashAlert, dashButton, DashCard, DashEmptyState, DashField, dashInput, DashPill, DashSectionIntro, DashStatus, sendJson } from "./dashboard-ui";
import ImagePicker from "./website-editor/ImagePicker";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-xyvoo-blue focus-visible:ring-offset-2";

type EditBlock = { key: string; block: BlogBlock };
type Draft = {
  id: string | null;
  title: string;
  postSlug: string;
  slugTouched: boolean;
  summary: string;
  author: string;
  coverUrl: string | null;
  coverAlt: string;
  blocks: EditBlock[];
  status: "draft" | "published";
  publishedAt: string;
  seoTitle: string;
  seoDescription: string;
};

let counter = 0;
const nextKey = () => `bb${(counter += 1)}`;

/** An ISO time as the value a datetime-local input wants, in the browser's own time zone. */
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const blank = (): Draft => ({
  id: null,
  title: "",
  postSlug: "",
  slugTouched: false,
  summary: "",
  author: "",
  coverUrl: null,
  coverAlt: "",
  blocks: [{ key: nextKey(), block: { type: "text", text: "" } }],
  status: "draft",
  publishedAt: "",
  seoTitle: "",
  seoDescription: "",
});

const fromPost = (p: BlogPost): Draft => ({
  id: p.id,
  title: p.title,
  postSlug: p.slug,
  slugTouched: true,
  summary: p.summary ?? "",
  author: p.author ?? "",
  coverUrl: p.coverUrl,
  coverAlt: p.coverAlt ?? "",
  blocks: p.body.map((block) => ({ key: nextKey(), block })),
  status: p.status,
  publishedAt: toLocalInput(p.publishedAt),
  seoTitle: p.seoTitle ?? "",
  seoDescription: p.seoDescription ?? "",
});

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

/** Dashboard → Blog: write posts, choose when they go live, and see which are published. */
export default function BlogManager({ slug }: { slug: string }) {
  const [posts, setPosts] = useState<BlogPost[] | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  // Read once, so "scheduled" and "live" don't flicker between renders.
  const [now, setNow] = useState(() => new Date());

  const load = () =>
    fetch(`/api/store/blog?slug=${encodeURIComponent(slug)}`)
      .then(async (res) => ({ ok: res.ok, body: await res.json().catch(() => ({})) }))
      .then(({ ok, body }) => {
        if (!ok) return setError(typeof body.error === "string" ? body.error : "We couldn't load your posts.");
        setPosts(body.posts);
        setNow(new Date());
      })
      .catch(() => setError("We couldn't load your posts. Please refresh the page."));

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  if (!posts) {
    return error ? (
      <DashAlert message={error} />
    ) : (
      <p className="text-sm text-slate-600" role="status">
        Loading your posts…
      </p>
    );
  }

  const state = (p: BlogPost) => (p.status === "draft" ? { label: "Draft", tone: "slate" as const } : isPostLive(p, now) ? { label: "Published", tone: "green" as const } : { label: `Goes live ${when(p.publishedAt)}`, tone: "blue" as const });

  return (
    <div className="space-y-6">
      <DashSectionIntro
        id="blog"
        meaning="marketing"
        art="tag"
        title="Give people a reason to visit"
        points={[
          "Write about new arrivals, how to use what you sell, or the story behind your shop. Each post gets its own page that Google can find.",
          "Save a post as a draft while you work on it, then publish it now or choose a date for it to go live.",
          "Your posts appear on your shop at /blog. Add that link to your menu from the Website editor, and show the latest posts on your homepage with the Journal section.",
        ]}
      />

      <DashAlert message={error} />
      <DashStatus message={message} />

      {draft ? (
        <PostEditor
          key={draft.id ?? "new"}
          slug={slug}
          initial={draft}
          onCancel={() => setDraft(null)}
          onDone={async (text) => {
            setDraft(null);
            setMessage(text);
            await load();
          }}
        />
      ) : (
        <DashCard
          id="blog-list"
          icon={FileText}
          title="Your posts"
          description="Newest first."
          actions={
            <button type="button" onClick={() => { setMessage(""); setDraft(blank()); }} className={`${dashButton.primary} ${focusRing}`}>
              <Plus className="h-4 w-4" aria-hidden /> New post
            </button>
          }
        >
          {posts.length === 0 ? (
            <DashEmptyState art="tag" meaning="marketing" title="No posts yet" description="Write your first post. Even a short one about what's new in your shop is a good start." />
          ) : (
            <ul className="divide-y divide-slate-100">
              {posts.map((p) => {
                const s = state(p);
                return (
                  <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
                    <div className="min-w-0">
                      <p className="break-words font-medium text-slate-900">{p.title}</p>
                      <p className="break-all text-sm text-slate-600">/blog/{p.slug}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <DashPill tone={s.tone}>{s.label}</DashPill>
                      <button type="button" onClick={() => { setMessage(""); setDraft(fromPost(p)); }} className={`${dashButton.secondary} ${focusRing}`}>
                        <Pencil className="h-4 w-4" aria-hidden /> Edit<span className="sr-only"> {p.title}</span>
                      </button>
                      {isPostLive(p, now) ? (
                        <a href={`/shop/${encodeURIComponent(slug)}/blog/${p.slug}`} target="_blank" rel="noopener noreferrer" className={`${dashButton.quiet} ${focusRing}`}>
                          <ExternalLink className="h-4 w-4" aria-hidden /> See it<span className="sr-only"> {p.title} on your shop (opens in a new tab)</span>
                        </a>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </DashCard>
      )}
    </div>
  );
}

function PostEditor({ slug, initial, onCancel, onDone }: { slug: string; initial: Draft; onCancel: () => void; onDone: (message: string) => Promise<void> }) {
  const id = useId();
  const [d, setD] = useState<Draft>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const setBlock = (key: string, block: BlogBlock) => setD((s) => ({ ...s, blocks: s.blocks.map((b) => (b.key === key ? { key, block } : b)) }));
  const move = (i: number, by: -1 | 1) =>
    setD((s) => {
      const to = i + by;
      if (to < 0 || to >= s.blocks.length) return s;
      const list = [...s.blocks];
      [list[i], list[to]] = [list[to], list[i]];
      return { ...s, blocks: list };
    });
  const add = (block: BlogBlock) => setD((s) => ({ ...s, blocks: [...s.blocks, { key: nextKey(), block }] }));

  const body = () => ({
    slug,
    postSlug: d.postSlug || slugifyTitle(d.title),
    title: d.title,
    summary: d.summary,
    author: d.author,
    coverUrl: d.coverUrl,
    coverAlt: d.coverAlt,
    body: d.blocks.map((b) => (b.block.type === "list" ? { ...b.block, items: b.block.items.map((i) => i.trim()).filter(Boolean) } : b.block)),
    status: d.status,
    publishedAt: d.publishedAt ? new Date(d.publishedAt).toISOString() : null,
    seoTitle: d.seoTitle,
    seoDescription: d.seoDescription,
  });

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = d.id ? await sendJson(`/api/store/blog/${d.id}`, "PUT", body()) : await sendJson("/api/store/blog", "POST", body());
      const post = res.post as BlogPost;
      await onDone(post.status === "published" ? (isPostLive(post, new Date()) ? `“${post.title}” is published.` : `“${post.title}” is saved and will go live on ${when(post.publishedAt)}.`) : `“${post.title}” is saved as a draft.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!d.id) return;
    setSaving(true);
    setError("");
    try {
      await sendJson(`/api/store/blog/${d.id}?slug=${encodeURIComponent(slug)}`, "DELETE");
      await onDone("Post removed.");
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  };

  return (
    <DashCard id="blog-editor" icon={FileText} title={initial.id ? "Change this post" : "New post"} description="Write it your way: headings, paragraphs, lists and pictures.">
      <div className="space-y-6">
        <DashAlert message={error} />

        <div className="grid gap-4 sm:grid-cols-2">
          <DashField id={`${id}-title`} label="Title">
            <input
              id={`${id}-title`}
              className={dashInput}
              value={d.title}
              maxLength={140}
              onChange={(e) => setD({ ...d, title: e.target.value, postSlug: d.slugTouched ? d.postSlug : slugifyTitle(e.target.value) })}
              autoComplete="off"
            />
          </DashField>
          <DashField id={`${id}-slug`} label="Web address" hint={`Shown as /blog/${d.postSlug || "your-post"}. Made from the title unless you change it.`}>
            <input id={`${id}-slug`} className={dashInput} value={d.postSlug} maxLength={80} onChange={(e) => setD({ ...d, postSlug: e.target.value.toLowerCase(), slugTouched: true })} aria-describedby={`${id}-slug-hint`} autoComplete="off" />
          </DashField>
          <DashField id={`${id}-summary`} label="Short summary" optional hint="One or two sentences shown on the blog page and when someone shares the post.">
            <textarea id={`${id}-summary`} className={`${dashInput} min-h-20`} value={d.summary} maxLength={300} onChange={(e) => setD({ ...d, summary: e.target.value })} aria-describedby={`${id}-summary-hint`} />
          </DashField>
          <DashField id={`${id}-author`} label="Written by" optional>
            <input id={`${id}-author`} className={dashInput} value={d.author} maxLength={80} onChange={(e) => setD({ ...d, author: e.target.value })} autoComplete="off" />
          </DashField>
        </div>

        <ImagePicker id={`${id}-cover`} label="Cover picture (optional)" slug={slug} url={d.coverUrl} onChange={(url) => setD({ ...d, coverUrl: url })} alt={d.coverAlt} onAltChange={(alt) => setD({ ...d, coverAlt: alt })} />

        <fieldset className="space-y-3">
          <legend className="text-sm font-semibold text-slate-900">The post</legend>
          <ul className="space-y-3">
            {d.blocks.map(({ key, block }, i) => (
              <li key={key} className="rounded-xl border border-slate-200 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-slate-700">
                    {block.type === "heading" ? "Heading" : block.type === "text" ? "Paragraph" : block.type === "list" ? "List" : "Picture"} {i + 1}
                  </p>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className={`${dashButton.quiet} ${focusRing}`}>
                      <ArrowUp className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Move block {i + 1} up</span>
                    </button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === d.blocks.length - 1} className={`${dashButton.quiet} ${focusRing}`}>
                      <ArrowDown className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Move block {i + 1} down</span>
                    </button>
                    <button type="button" onClick={() => setD((s) => ({ ...s, blocks: s.blocks.filter((b) => b.key !== key) }))} className={`${dashButton.danger} ${focusRing}`}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                      <span className="sr-only">Remove block {i + 1}</span>
                    </button>
                  </div>
                </div>
                {block.type === "heading" ? (
                  <input aria-label={`Heading ${i + 1}`} className={dashInput} value={block.text} maxLength={140} onChange={(e) => setBlock(key, { ...block, text: e.target.value })} placeholder="A short heading" />
                ) : block.type === "text" ? (
                  <textarea aria-label={`Paragraph ${i + 1}`} className={`${dashInput} min-h-32`} value={block.text} maxLength={5000} onChange={(e) => setBlock(key, { ...block, text: e.target.value })} placeholder="Write your paragraph. A blank line starts a new one." />
                ) : block.type === "list" ? (
                  <textarea
                    aria-label={`List ${i + 1}, one item on each line`}
                    className={`${dashInput} min-h-24`}
                    value={block.items.join("\n")}
                    onChange={(e) => setBlock(key, { ...block, items: e.target.value.split("\n") })}
                    placeholder="One item on each line"
                  />
                ) : (
                  <div className="space-y-2">
                    <ImagePicker id={`${id}-img-${key}`} label="Picture" slug={slug} url={block.url || null} onChange={(url) => setBlock(key, { ...block, url: url ?? "" })} alt={block.alt} onAltChange={(alt) => setBlock(key, { ...block, alt })} />
                    <input aria-label={`Caption for picture ${i + 1} (optional)`} className={dashInput} value={block.caption} maxLength={200} onChange={(e) => setBlock(key, { ...block, caption: e.target.value })} placeholder="Caption (optional)" />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => add({ type: "heading", text: "" })} className={`${dashButton.secondary} ${focusRing}`}>
              <Plus className="h-4 w-4" aria-hidden /> Heading
            </button>
            <button type="button" onClick={() => add({ type: "text", text: "" })} className={`${dashButton.secondary} ${focusRing}`}>
              <Plus className="h-4 w-4" aria-hidden /> Paragraph
            </button>
            <button type="button" onClick={() => add({ type: "list", items: [""] })} className={`${dashButton.secondary} ${focusRing}`}>
              <Plus className="h-4 w-4" aria-hidden /> List
            </button>
            <button type="button" onClick={() => add({ type: "image", url: "", alt: "", caption: "" })} className={`${dashButton.secondary} ${focusRing}`}>
              <Plus className="h-4 w-4" aria-hidden /> Picture
            </button>
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <DashField id={`${id}-status`} label="Status">
            <select id={`${id}-status`} className={dashInput} value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as "draft" | "published" })}>
              <option value="draft">Draft: only you can see it</option>
              <option value="published">Published: shown on your shop</option>
            </select>
          </DashField>
          <DashField id={`${id}-when`} label="Goes live" optional hint="Leave empty to publish straight away. A later date keeps it hidden until then.">
            <input id={`${id}-when`} type="datetime-local" className={dashInput} value={d.publishedAt} onChange={(e) => setD({ ...d, publishedAt: e.target.value })} aria-describedby={`${id}-when-hint`} />
          </DashField>
        </div>

        <details className="rounded-xl border border-slate-200 p-4">
          <summary className={`cursor-pointer text-sm font-medium text-slate-800 ${focusRing}`}>For search engines (optional)</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <DashField id={`${id}-seot`} label="Search title" optional hint="Up to 70 characters. Uses the post's title if empty.">
              <input id={`${id}-seot`} className={dashInput} value={d.seoTitle} maxLength={70} onChange={(e) => setD({ ...d, seoTitle: e.target.value })} aria-describedby={`${id}-seot-hint`} />
            </DashField>
            <DashField id={`${id}-seod`} label="Search description" optional hint="Up to 170 characters. Uses the summary if empty.">
              <textarea id={`${id}-seod`} className={`${dashInput} min-h-20`} value={d.seoDescription} maxLength={170} onChange={(e) => setD({ ...d, seoDescription: e.target.value })} aria-describedby={`${id}-seod-hint`} />
            </DashField>
          </div>
        </details>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
          <button type="button" onClick={save} disabled={saving} className={`${dashButton.primary} ${focusRing}`}>
            {saving ? "Saving…" : d.status === "published" ? "Save and publish" : "Save draft"}
          </button>
          <button type="button" onClick={onCancel} disabled={saving} className={`${dashButton.secondary} ${focusRing}`}>
            Close without saving
          </button>
          {d.id ? (
            confirmDelete ? (
              <span className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
                Remove this post for good?
                <button type="button" onClick={remove} disabled={saving} className={`${dashButton.danger} ${focusRing}`}>
                  Yes, remove it
                </button>
                <button type="button" onClick={() => setConfirmDelete(false)} className={`${dashButton.quiet} ${focusRing}`}>
                  Keep it
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={saving} className={`${dashButton.quiet} ${focusRing} sm:ml-auto`}>
                <Trash2 className="h-4 w-4" aria-hidden /> Remove post
              </button>
            )
          ) : null}
        </div>
      </div>
    </DashCard>
  );
}
