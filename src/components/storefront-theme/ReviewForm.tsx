"use client";

import { useState } from "react";
import Link from "next/link";
import { MAX_REVIEW_PHOTOS, MAX_REVIEW_PHOTO_BYTES } from "@/lib/store/reviews";
import type { ReviewableOrder } from "@/lib/store/reviews-server";
import { Icon } from "./primitives";
import type { MessageKey } from "@/lib/store/i18n/messages";
import { useStorefront, useT } from "./StorefrontProvider";

type Item = ReviewableOrder["items"][number];
type Draft = { rating: number; title: string; comment: string; images: string[]; uploading: number; photoError: string };

const RATING_WORDS: MessageKey[] = ["product.ratingPoor", "product.ratingNotGreat", "product.ratingGood", "product.ratingVeryGood", "product.ratingExcellent"];

/** Rate each item bought, comment and add photos. Sent as one review per item; unrated items are skipped. */
export default function ReviewForm({ token, defaultName, items, shopHref }: { token: string; defaultName: string; items: Item[]; shopHref: string }) {
  const { slug } = useStorefront();
  const t = useT();
  const ratingWord = (n: number) => t(RATING_WORDS[n - 1]);
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
      update(id, { photoError: t("product.photoLimit", { max: MAX_REVIEW_PHOTOS }) });
      return;
    }
    update(id, { photoError: "", uploading: drafts[id].uploading + chosen.length });
    for (const file of chosen) {
      let error = "";
      if (file.size > MAX_REVIEW_PHOTO_BYTES) error = t("product.photoTooLarge", { file: file.name });
      else {
        const form = new FormData();
        form.append("token", token);
        form.append("file", file);
        try {
          const res = await fetch(`/api/shop/${encodeURIComponent(slug)}/reviews/photos`, { method: "POST", body: form });
          const data = await res.json().catch(() => ({}));
          if (res.ok && typeof data.url === "string") setDrafts((d) => ({ ...d, [id]: { ...d[id], images: [...d[id].images, data.url].slice(0, MAX_REVIEW_PHOTOS) } }));
          else error = typeof data.error === "string" ? data.error : t("product.photoFailed");
        } catch {
          error = t("product.photoFailedConnection");
        }
      }
      setDrafts((d) => ({ ...d, [id]: { ...d[id], uploading: Math.max(d[id].uploading - 1, 0), photoError: error || d[id].photoError } }));
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const rated = items.filter((i) => drafts[i.orderItemId].rating > 0);
    if (!rated.length) {
      setStatus(t("product.chooseRating"));
      return;
    }
    if (!name.trim()) {
      setStatus(t("product.nameNeeded"));
      document.getElementById("rv-name")?.focus();
      return;
    }
    if (items.some((i) => drafts[i.orderItemId].uploading > 0)) {
      setStatus(t("product.waitForPhotos"));
      return;
    }
    setSending(true);
    setStatus(t("product.sendingReview"));
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
        setStatus(typeof data.error === "string" ? data.error : t("product.reviewFailed"));
        return;
      }
      setDone({ published: Boolean(data.published) });
      setStatus("");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setStatus(t("common.offline"));
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="review-thanks" role="status">
        <Icon name="check-circle" />
        <h2 className="h-section">{t("product.thanksTitle")}</h2>
        <p className="body-copy">
          {done.published ? t("product.reviewPublished") : t("product.reviewPending")} {t("product.canChangeLater")}
        </p>
        <Link className="btn btn--primary" href={shopHref}>
          {t("product.backToShop")}
        </Link>
      </div>
    );
  }

  return (
    <form className="review-form" onSubmit={submit} noValidate aria-label={t("product.reviewYourOrder")}>
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
                {item.review ? <p className="muted">{t("product.reviewedBefore")}</p> : null}
              </div>
            </div>

            <fieldset className="star-rating">
              <legend>{t("product.yourRating")}</legend>
              <div className="star-rating__stars">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label key={n} className={n <= d.rating ? "is-on" : ""}>
                    <input type="radio" name={`${base}-rating`} value={n} checked={d.rating === n} onChange={() => update(item.orderItemId, { rating: n })} />
                    <Icon name={n <= d.rating ? "star" : "star-empty"} />
                    <span className="visually-hidden">
                      {t("product.starLabel", { count: n, rating: ratingWord(n) })}
                    </span>
                  </label>
                ))}
              </div>
              <p className="hint" aria-live="polite">
                {d.rating ? ratingWord(d.rating) : t("product.notRated")}
              </p>
            </fieldset>

            <div className="field">
              <label htmlFor={`${base}-title`}>
                {t("product.sumItUp")} <span className="optional">{t("common.optional")}</span>
              </label>
              <input className="input" id={`${base}-title`} maxLength={100} value={d.title} onChange={(e) => update(item.orderItemId, { title: e.target.value })} placeholder={t("product.titlePlaceholder")} />
            </div>
            <div className="field">
              <label htmlFor={`${base}-comment`}>
                {t("product.yourComment")} <span className="optional">{t("common.optional")}</span>
              </label>
              <textarea className="textarea" id={`${base}-comment`} rows={4} maxLength={2000} value={d.comment} onChange={(e) => update(item.orderItemId, { comment: e.target.value })} aria-describedby={`${base}-comment-hint`} />
              <p className="hint" id={`${base}-comment-hint`}>
                {t("product.commentHint")}
              </p>
            </div>

            <div className="field">
              <span className="field-label" id={`${base}-photos-label`}>
                {t("product.photosLabel")} <span className="optional">{t("product.photosOptional", { max: MAX_REVIEW_PHOTOS })}</span>
              </span>
              {d.images.length ? (
                <ul className="review-photos" aria-labelledby={`${base}-photos-label`}>
                  {d.images.map((url, j) => (
                    <li key={url}>
                      <img src={url} alt={t("product.yourPhotoAlt", { number: j + 1, name: item.name })} loading="lazy" decoding="async" />
                      <button type="button" className="link-button" onClick={() => update(item.orderItemId, { images: d.images.filter((u) => u !== url) })}>
                        {t("common.remove")}<span className="visually-hidden"> {t("product.photoNumber", { number: j + 1 })}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {d.images.length + d.uploading < MAX_REVIEW_PHOTOS ? (
                <label className="btn btn--outline review-photos__add">
                  <Icon name="image" size="sm" /> {d.uploading ? t("product.addingPhoto") : t("product.addPhoto")}
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
                {d.photoError || (d.uploading ? t("product.uploading") : "")}
              </p>
            </div>
          </section>
        );
      })}

      <div className="field">
        <label htmlFor="rv-name">{t("product.nameShown")}</label>
        <input className="input" id="rv-name" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" aria-describedby="rv-name-hint" />
        <p className="hint" id="rv-name-hint">
          {t("product.nameHint")}
        </p>
      </div>
      <button className="btn btn--primary" type="submit" disabled={sending}>
        {sending ? t("common.sending") : reviewedBefore ? t("product.updateReview") : t("product.sendReview")}
      </button>
      <p className="form-status" role="status">
        {status}
      </p>
    </form>
  );
}
