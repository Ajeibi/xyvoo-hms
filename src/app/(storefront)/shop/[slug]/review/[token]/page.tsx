import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import ReviewForm from "@/components/storefront-theme/ReviewForm";
import { reviewerName } from "@/lib/store/reviews";
import { loadReviewableOrder } from "@/lib/store/reviews-server";
import { STORE_PATHS, storeHref } from "@/lib/store/site/links";
import { getStorefront } from "@/lib/store/site/storefront";
import { getShopT } from "@/lib/store/i18n/server";

// A private link: never indexed, never cached.
export async function generateMetadata({ params }: { params: Promise<{ slug: string; token: string }> }): Promise<Metadata> {
  const storefront = await getStorefront((await params).slug);
  const title = storefront ? getShopT(storefront)("product.reviewYourOrder") : "Review your order";
  return { title, robots: { index: false, follow: false } };
}
export const dynamic = "force-dynamic";

export default async function ReviewOrderPage({ params }: { params: Promise<{ slug: string; token: string }> }) {
  const { slug, token } = await params;
  const storefront = await getStorefront(slug);
  if (!storefront) notFound();
  const order = await loadReviewableOrder(storefront.tenant.id, token);
  if (!order) notFound();
  const shopHref = storeHref(storefront.basePath, STORE_PATHS.products);
  const t = getShopT(storefront);

  return (
    <div className="container section">
      <p className="eyebrow">{t("product.yourOrder")}</p>
      <h1 className="h-page">{t("product.howDidWeDo")}</h1>
      {order.status !== "Delivered" ? (
        <div className="body-copy">
          <p>{t("product.reviewAfterDelivery")}</p>
          <p>
            <Link className="link-arrow" href={shopHref}>
              {t("product.backToShop")}
            </Link>
          </p>
        </div>
      ) : (
        <>
          <p className="lead">{t("product.reviewIntro")}</p>
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
