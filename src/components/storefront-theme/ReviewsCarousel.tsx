import { CarouselControls, CarouselRoot, CarouselTrack } from "./Carousel";
import { Icon, Rating } from "./primitives";

export type CarouselReview = { id: string; name: string; rating: number; title: string | null; comment: string };

/** Customer reviews strip from the template home pages. */
export default function ReviewsCarousel({
  id,
  heading,
  reviews,
  nextClassName,
}: {
  id: string;
  heading: string;
  reviews: CarouselReview[];
  /** Loftwood highlights the "next" button. */
  nextClassName?: string;
}) {
  const titleId = `${id}-title`;
  const trackId = `${id}-track`;

  return (
    <section className="section section--tight-top" aria-labelledby={titleId}>
      <CarouselRoot>
        <div className="container">
          <div className="section-head">
            <div>
              <h2 className="h-section" id={titleId}>
                {heading}
              </h2>
            </div>
            {reviews.length > 1 ? <CarouselControls trackId={trackId} noun="reviews" nextClassName={nextClassName} /> : null}
          </div>
          <CarouselTrack id={trackId} label="Customer reviews, scrollable">
            {reviews.map((review) => (
              <li key={review.id}>
                <figure className="review">
                  <span className="review__avatar" aria-hidden="true">
                    <Icon name="user" />
                  </span>
                  <div className="review__body">
                    <blockquote>
                      <p>“{review.comment}”</p>
                    </blockquote>
                    <Rating value={review.rating} />
                    <figcaption>
                      <strong>{review.name}</strong>
                    </figcaption>
                  </div>
                </figure>
              </li>
            ))}
          </CarouselTrack>
        </div>
      </CarouselRoot>
    </section>
  );
}
