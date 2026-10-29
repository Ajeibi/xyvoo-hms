"use client";

import { Rating } from "./primitives";
import { useT } from "./StorefrontProvider";

/** A product card's stars, read out in the shopper's language (the card itself is drawn on the server). */
export default function CardRating({ value, count }: { value: number; count: number }) {
  const t = useT();
  return <Rating t={t} value={value} count={count} />;
}
