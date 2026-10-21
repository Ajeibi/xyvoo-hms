"use client";

import { useId, useState } from "react";
import { Rating } from "./primitives";

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
const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "newest", label: "Newest" },
  { value: "highest", label: "Highest rated" },
  { value: "lowest", label: "Lowest rated" },
  { value: "photos", label: "With photos first" },
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
  const howTo = `Bought this from ${storeName}? Once your order has been delivered, we'll email you a link to review it.`;

  return (
    <section className="section section--tight-top" id="reviews" aria-labelledby={`${id}-title`}>
      <div className="container reviews-layout">
        <div className="reviews-summary">
          <h2 className="h-card" id={`${id}-title`}>
            Customer reviews
          </h2>
          {ratingCount > 0 ? (
            <>
              <p>
                <span className="score">{ratingAverage.toFixed(1)}</span> <span className="muted">out of 5</span>
              </p>
              <Rating value={ratingAverage} count={ratingCount} />
              <ul className="review-bars" aria-label="Reviews by star rating">
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
                        {n} star{n === 1 ? "" : "s"}
                      </span>
                      <span className="review-bar__track" aria-hidden="true">
                        <span style={{ width: `${reviews.length ? Math.round((count / reviews.length) * 100) : 0}%` }} />
                      </span>
                      <span className="review-bar__count">
                        {count}
                        <span className="visually-hidden"> {count === 1 ? "review" : "reviews"}</span>
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
                {stars ? `${filtered.length} ${stars}-star ${filtered.length === 1 ? "review" : "reviews"}` : `${reviews.length} ${reviews.length === 1 ? "review" : "reviews"}`}
                {stars ? (
                  <>
                    {" "}
                    <button type="button" className="link-btn" onClick={() => setStars(null)}>
                      Show all
                    </button>
                  </>
                ) : null}
              </p>
              {reviews.length > 1 ? (
                <div className="toolbar__sort">
                  <label htmlFor={`${id}-sort`}>Sort by</label>
                  <select className="select" id={`${id}-sort`} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
                    {SORTS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="body-copy">No reviews yet. Be the first to share what you think.</p>
          )}

          <ul className="review-list">
            {visible.map((review) => (
              <li className="review-item" key={review.id}>
                <Rating value={review.rating} />
                {review.title ? <h3>{review.title}</h3> : null}
                {review.comment ? <p>{review.comment}</p> : null}
                {review.images.length ? (
                  <ul className="review-photos" aria-label={`Photos from ${review.customer_name}`}>
                    {review.images.map((img, j) => (
                      <li key={img.url}>
                        <a href={img.url} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element -- shoppers' own photos, shown small */}
                          <img src={img.url} alt={`Photo ${j + 1} from ${review.customer_name}'s review`} loading="lazy" decoding="async" width={96} height={96} />
                          <span className="visually-hidden"> (opens full size in a new tab)</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="review-meta">
                  {review.customer_name} · {new Date(review.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                  {review.verified ? (
                    <>
                      {" "}
                      · <span className="review-verified">Verified purchase</span>
                    </>
                  ) : null}
                </p>
                {review.reply ? (
                  <div className="review-reply">
                    <strong>Reply from {storeName}</strong>
                    <p>{review.reply}</p>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {sorted.length > shown ? (
            <button type="button" className="btn btn--outline" onClick={() => setShown((n) => n + STEP)}>
              Show more reviews ({sorted.length - shown} more)
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
