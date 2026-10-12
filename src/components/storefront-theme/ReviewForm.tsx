"use client";

import { useState } from "react";
import Link from "next/link";
import { MAX_REVIEW_PHOTOS, MAX_REVIEW_PHOTO_BYTES } from "@/lib/store/reviews";
import type { ReviewableOrder } from "@/lib/store/reviews-server";
import { Icon } from "./primitives";
import { useStorefront } from "./StorefrontProvider";

type Item = ReviewableOrder["items"][number];
type Draft = { rating: number; title: string; comment: string; images: string[]; uploading: number; photoError: string };

const RATING_WORDS = ["", "Poor", "Not great", "Good", "Very good", "Excellent"];

/** Rate each item bought, comment and add photos. Sent as one review per item; unrated items are skipped. */
export default function ReviewForm({ token, defaultName, items, shopHref }: { token: string; defaultName: string; items: Item[]; shopHref: string }) {
  const { slug } = useStorefront();
  const [name, setName] = useState(defaultName);
  const [drafts, setDrafts] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(
      items.map((i) => [
        i.orderItemId,
        { rating: i.review?.rating ?? 0, title: i.review?.title ?? "", comment: i.review?.comment ?? "", images: i.review?.images ?? [], uploading: 0, photoError: "" },
      ]),
    ),
  );
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<null | { published: boolean }>(null);
  const reviewedBefore = items.some((i) => i.review);

  const update = (id: string, patch: Partial<Draft>) => setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const addPhotos = async (id: string, files: FileList | null) => {
    if (!files?.length) return;
    const room = MAX_REVIEW_PHOTOS - drafts[id].images.length - drafts[id].uploading;
    const chosen = [...files].slice(0, Math.max(room, 0));
    if (!chosen.length) {
      update(id, { photoError: `You can add up to ${MAX_REVIEW_PHOTOS} photos for each item.` });
      return;
    }
    update(id, { photoError: "", uploading: drafts[id].uploading + chosen.length });
    for (const file of chosen) {
      let error = "";
      if (file.size > MAX_REVIEW_PHOTO_BYTES) error = `${file.name} is too large. Please choose a photo under 5MB.`;
      else {
        const form = new FormData();
        form.append("token", token);
        form.append("file", file);
        try {
          const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/reviews/photos`, { method: "POST", body: form });
          const data = await res.json().catch(() => ({}));
          if (res.ok && typeof data.url === "string") setDrafts((d) => ({ ...d, [id]: { ...d[id], images: [...d[id].images, data.url].slice(0, MAX_REVIEW_PHOTOS) } }));
          else error = typeof data.error === "string" ? data.error : "We couldn't add that photo.";
        } catch {
          error = "We couldn't add that photo. Check your connection and try again.";
        }
      }
      setDrafts((d) => ({ ...d, [id]: { ...d[id], uploading: Math.max(d[id].uploading - 1, 0), photoError: error || d[id].photoError } }));
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const rated = items.filter((i) => drafts[i.orderItemId].rating > 0);
    if (!rated.length) {
      setStatus("Choose a star rating for at least one item.");
      return;
    }
    if (!name.trim()) {
      setStatus("Tell us the name to show with your review.");
      document.getElementById("rv-name")?.focus();
      return;
    }
    if (items.some((i) => drafts[i.orderItemId].uploading > 0)) {
      setStatus("Please wait for your photos to finish uploading.");
      return;
    }
    setSending(true);
    setStatus("Sending your review…");
    try {
      const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          displayName: name.trim(),
          reviews: rated.map((i) => {
            const d = drafts[i.orderItemId];
            return { orderItemId: i.orderItemId, rating: d.rating, title: d.title.trim(), comment: d.comment.trim(), images: d.images };
          }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(typeof data.error === "string" ? data.error : "We couldn't send your review. Please try again.");
        return;
      }
      setDone({ published: Boolean(data.published) });
      setStatus("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setStatus("We couldn't connect. Check your internet connection and try again.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="review-thanks" role="status">
        <Icon name="check-circle" />
        <h2 className="h-section">Thank you for your review</h2>
        <p className="body-copy">
          {done.published ? "It's now on the shop for other shoppers to see." : "The shop will check it shortly, then it will appear for other shoppers to see."} You can come back to this
          page to change it.
        </p>
        <Link className="btn btn--primary" href={shopHref}>
          Back to the shop
        </Link>
      </div>
    );
  }

  return (
    <form className="review-form" onSubmit={submit} noValidate aria-label="Review your order">
      {items.map((item) => {
        const d = drafts[item.orderItemId];
        const base = `rv-${item.orderItemId}`;
        return (
          <section className="review-card" key={item.orderItemId} aria-labelledby={`${base}-name`}>
            <div className="review-card__product">
              <span className="media tone-6 review-card__thumb" aria-hidden="true">
                {item.imageUrl ? <img src={item.imageUrl} alt="" loading="lazy" decoding="async" /> : null}
              </span>
              <div>
                <h2 className="h-card" id={`${base}-name`}>
                  {item.name}
                </h2>
                {item.options ? <p className="muted">{item.options}</p> : null}
                {item.review ? <p className="muted">You reviewed this before. Change anything and send it again to update it.</p> : null}
              </div>
            </div>

            <fieldset className="star-rating">
              <legend>Your rating</legend>
              <div className="star-rating__stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className={n <= d.rating ? "is-on" : ""}>
                    <input type="radio" name={`${base}-rating`} value={n} checked={d.rating === n} onChange={() => update(item.orderItemId, { rating: n })} />
                    <Icon name={n <= d.rating ? "star" : "star-empty"} />
                    <span className="visually-hidden">
                      {n} {n === 1 ? "star" : "stars"}, {RATING_WORDS[n]}
                    </span>
                  </label>
                ))}
              </div>
              <p className="hint" aria-live="polite">
                {d.rating ? RATING_WORDS[d.rating] : "Not rated: this item will be skipped"}
              </p>
            </fieldset>

            <div className="field">
              <label htmlFor={`${base}-title`}>
                Sum it up <span className="optional">(optional)</span>
              </label>
              <input className="input" id={`${base}-title`} maxLength={100} value={d.title} onChange={(e) => update(item.orderItemId, { title: e.target.value })} placeholder="For example: Beautiful quality" />
            </div>
            <div className="field">
              <label htmlFor={`${base}-comment`}>
                Your comment <span className="optional">(optional)</span>
              </label>
              <textarea className="textarea" id={`${base}-comment`} rows={4} maxLength={2000} value={d.comment} onChange={(e) => update(item.orderItemId, { comment: e.target.value })} aria-describedby={`${base}-comment-hint`} />
              <p className="hint" id={`${base}-comment-hint`}>
                What did you like? How was the fit, quality or delivery?
              </p>
            </div>

            <div className="field">
              <span className="field-label" id={`${base}-photos-label`}>
                Photos <span className="optional">(optional, up to {MAX_REVIEW_PHOTOS})</span>
              </span>
              {d.images.length ? (
                <ul className="review-photos" aria-labelledby={`${base}-photos-label`}>
                  {d.images.map((url, j) => (
                    <li key={url}>
                      <img src={url} alt={`Your photo ${j + 1} of ${item.name}`} loading="lazy" decoding="async" />
                      <button type="button" className="link-button" onClick={() => update(item.orderItemId, { images: d.images.filter((u) => u !== url) })}>
                        Remove<span className="visually-hidden"> photo {j + 1}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {d.images.length + d.uploading < MAX_REVIEW_PHOTOS ? (
                <label className="btn btn--outline review-photos__add">
                  <Icon name="image" size="sm" /> {d.uploading ? "Adding photo…" : "Add a photo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    multiple
                    className="visually-hidden"
                    onChange={(e) => {
                      void addPhotos(item.orderItemId, e.target.files);
                      e.target.value = "";
                    }}
                  />
                </label>
              ) : null}
              <p className="hint" role="status">
                {d.photoError || (d.uploading ? "Uploading…" : "")}
              </p>
            </div>
          </section>
        );
      })}

      <div className="field">
        <label htmlFor="rv-name">Name shown with your review</label>
        <input className="input" id="rv-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" aria-describedby="rv-name-hint" />
        <p className="hint" id="rv-name-hint">
          We show your first name and the first letter of your surname. Your email is never shown.
        </p>
      </div>
      <button className="btn btn--primary" type="submit" disabled={sending}>
        {sending ? "Sending…" : reviewedBefore ? "Update my review" : "Send my review"}
      </button>
      <p className="form-status" role="status">
        {status}
      </p>
    </form>
  );
}
