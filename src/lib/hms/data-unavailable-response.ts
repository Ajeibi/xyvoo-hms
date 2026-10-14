import { NextResponse } from "next/server";

/** The API answer when a loader could not reach its data: retryable, and says so plainly. */
export function hmsDataUnavailableResponse() {
  return NextResponse.json(
    { error: "We couldn't load the latest information. Please try again in a moment.", retryable: true },
    { status: 503, headers: { "Retry-After": "10" } },
  );
}
