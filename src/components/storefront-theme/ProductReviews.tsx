"use client";

import { useId, useState } from "react";
import type { MessageKey } from "@/lib/store/i18n/messages";
import { Rating } from "./primitives";
import { useT } from "./StorefrontProvider";

export type ShownReview = {
  id: string;
  customer_name: string;
  rating: number;
  title: string | null;
  comment: string | null;
  created_at: string;
  images: Array<{ url: string }>;
  verified?: boolean;
  reply?: string | null;
};

type Sort = "newest" | "highest" | "lowest" | "photos";
const SORTS: Array<{ value: Sort; label: MessageKey }> = [
  { value: "newest", label: "product.sortNewest" },
  { value: "highest", label: "product.sortHighest" },
  { value: "lowest", label: "product.sortLowest" },
  { value: "photos", label: "product.sortPhotos" },
];
/** Reviews shown at a time; "Show more" adds this many again. */
const STEP = 10;

/**
 * The product's reviews: how many gave each star (each bar filters to that
 * star), sorting, and more at a time on request. With no reviews yet, it says
 * how to leave one, so the section is never just missing.
 */
export default function ProductReviews({
  reviews,
  ratingAverage,
  ratingCount,
  storeName,
}: {
  reviews: ShownReview[];
  ratingAverage: number;
  ratingCount: number;
  storeName: string;
}) {
  const id = useId();
  const t = useT();
  const [sort, setSort] = useState<Sort>("newest");
  const [stars, setStars] = useState<number | null>(null);
  const [shown, setShown] = useState(STEP);

  const counts = [5, 4, 3, 2, 1].map((n) => ({ n, count: reviews.filter((r) => Math.round(r.rating) === n).length }));
  const filtered = stars ? reviews.filter((r) => Math.round(r.rating) === stars) : reviews;
  const sorted = [...filtered].sort((a, b) => {
    const newest = b.created_at.localeCompare(a.created_at);
    if (sort === "highest") return b.rating - a.rating || newest;
    if (sort === "lowest") return a.rating - b.rating || newest;
    if (sort === "photos") return Number(b.images.length > 0) - Number(a.images.length > 0) || newest;
    return newest;
  });
  const visible = sorted.slice(0, shown);
  const howTo = t("product.reviewHowTo", { store: storeName });

  return (
    <section className="section section--tight-top" id="reviews" aria-labelledby={`${id}-title`}>
      <div className="container reviews-layout">
        <div className="reviews-summary">
          <h2 className="h-card" id={`${id}-title`}>
            {t("product.customerReviews")}
          </h2>
          {ratingCount > 0 ? (
            <>
              <p>
                <span className="score">{ratingAverage.toFixed(1)}</span> <span className="muted">{t("product.outOfFive")}</span>
              </p>
              <Rating t={t} value={ratingAverage} count={ratingCount} />
              <ul className="review-bars" aria-label={t("product.reviewsByStar")}>
                {counts.map(({ n, count }) => (
                  <li key={n}>
                    <button
                      type="button"
                      className="review-bar"
                      aria-pressed={stars === n}
                      disabled={!count}
                      onClick={() => {
                        setStars(stars === n ? null : n);
                        setShown(STEP);
                      }}
                    >
                      <span className="review-bar__label">
                        {t("product.starCount", { count: n })}
                      </span>
                      <span className="review-bar__track" aria-hidden="true">
                        <span style={{ width: `${reviews.length ? Math.round((count / reviews.length) * 100) : 0}%` }} />
                      </span>
                      <span className="review-bar__count">
                        {count}
                        <span className="visually-hidden"> {t("product.reviewNoun", { count })}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <p className="hint">{howTo}</p>
        </div>

        <div>
          {reviews.length ? (
            <div className="toolbar review-toolbar">
              <p className="toolbar__count" role="status">
                {stars ? t("product.starReviewCount", { count: filtered.length, stars }) : t("product.reviewCount", { count: reviews.length })}
                {stars ? (
                  <>
                    {" "}
                    <button type="button" className="link-btn" onClick={() => setStars(null)}>
                      {t("product.showAll")}
                    </button>
                  </>
                ) : null}
              </p>
              {reviews.length > 1 ? (
                <div className="toolbar__sort">
                  <label htmlFor={`${id}-sort`}>{t("product.sortBy")}</label>
                  <select className="select" id={`${id}-sort`} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    {SORTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {t(s.label)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="body-copy">{t("product.noReviewsYet")}</p>
          )}

          <ul className="review-list">
            {visible.map((review) => (
              <li className="review-item" key={review.id}>
                <Rating t={t} value={review.rating} />
                {review.title ? <h3>{review.title}</h3> : null}
                {review.comment ? <p>{review.comment}</p> : null}
                {review.images.length ? (
                  <ul className="review-photos" aria-label={t("product.photosFrom", { name: review.customer_name })}>
                    {review.images.map((img, j) => (
                      <li key={img.url}>
                        <a href={img.url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element -- shoppers' own photos, shown small */}
                          <img src={img.url} alt={t("product.reviewPhotoAlt", { number: j + 1, name: review.customer_name })} loading="lazy" decoding="async" width={96} height={96} />
                          <span className="visually-hidden"> {t("product.opensFullSize")}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="review-meta">
                  {review.customer_name} · {new Date(review.created_at).toLocaleDateString(t.lang === "en" ? "en-GB" : t.lang, { day: "numeric", month: "long", year: "numeric" })}
                  {review.verified ? (
                    <>
                      {" "}
                      · <span className="review-verified">{t("product.verifiedPurchase")}</span>
                    </>
                  ) : null}
                </p>
                {review.reply ? (
                  <div className="review-reply">
                    <strong>{t("product.replyFrom", { store: storeName })}</strong>
                    <p>{review.reply}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {sorted.length > shown ? (
            <button type="button" className="btn btn--outline" onClick={() => setShown((n) => n + STEP)}>
              {t("product.showMoreReviews", { count: sorted.length - shown })}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
