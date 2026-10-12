import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReviewForm from "@/components/storefront-theme/ReviewForm";
import { reviewerName } from "@/lib/store/reviews";
import { loadReviewableOrder } from "@/lib/store/reviews-server";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";

// A private link: never indexed, never cached.
export const metadata: Metadata = { title: "Review your order", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function ReviewOrderPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const storefront = await getStorefront(slug);
  if (!storefront) notFound();
  const order = await loadReviewableOrder(storefront.tenant.id, token);
  if (!order) notFound();
  const shopHref = storeHref(storefront.basePath, STORE_PATHS.products);

  return (
    <div className="container section">
      <p className="eyebrow">Your order</p>
      <h1 className="h-page">How did we do?</h1>
      {order.status !== "Delivered" ? (
        <div className="body-copy">
          <p>You can review your order once it&rsquo;s been delivered. We&rsquo;ll email you when it&rsquo;s time.</p>
          <p>
            <Link className="link-arrow" href={shopHref}>
              Back to the shop
            </Link>
          </p>
        </div>
      ) : (
        <>
          <p className="lead">Rate the items you bought, tell other shoppers what you thought, and add a photo if you like. Skip anything you&rsquo;d rather not review.</p>
          <ReviewForm
            token={token}
            defaultName={reviewerName(order.customerName)}
            items={order.items.filter((i) => i.productId)}
            shopHref={shopHref}
          />
        </>
      )}
    </div>
  );
}
