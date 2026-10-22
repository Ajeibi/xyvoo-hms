"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, StoreImage } from "./primitives";
import { useT } from "./StorefrontProvider";

/** A sideways swipe further than this (px) moves to the next or previous photo. */
const SWIPE = 40;

/**
 * The product photos: the main photo (swipe, or the arrows, to move between
 * them), thumbnails, and a full-screen view with keyboard support (left and
 * right arrows, Escape) in a native modal dialog. `shown` is the photo on
 * screen: an index into `images`, or a chosen option's own photo that isn't
 * one of them.
 */
export default function ProductGallery({
  images,
  shown,
  altFor,
  onSelect,
  productName,
}: {
  images: string[];
  shown: { src: string | null; alt: string; index: number };
  altFor: (i: number) => string;
  onSelect: (i: number) => void;
  productName: string;
}) {
  const t = useT();
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoomed, setZoomed] = useState<number | null>(null);
  const many = images.length > 1;
  const step = (from: number, by: number) => (from + by + images.length) % images.length;
  const current = shown.index >= 0 ? shown.index : 0;

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (zoomed != null && !el.open) el.showModal();
    if (zoomed == null && el.open) el.close();
  }, [zoomed]);

  // Where a swipe started is kept on the element itself, so nothing is held between renders.
  const swipe = (onMove: (by: number) => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.dataset.swipeX = String(e.clientX);
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      const start = Number(e.currentTarget.dataset.swipeX);
      delete e.currentTarget.dataset.swipeX;
      if (!Number.isFinite(start)) return;
      const dx = e.clientX - start;
      if (Math.abs(dx) > SWIPE) onMove(dx < 0 ? 1 : -1);
    },
  });

  const zoomSrc = zoomed != null ? (zoomed < 0 ? shown.src : images[zoomed]) : null;
  const zoomAlt = zoomed != null ? (zoomed < 0 ? shown.alt : altFor(zoomed)) : "";

  return (
    <div className="pdp__gallery">
      <div className="media gallery-main tone-4" {...(many ? swipe((by) => onSelect(step(current, by))) : {})}>
        {shown.src ? (
          <>
            <StoreImage src={shown.src} alt={shown.alt} sizes="(min-width: 900px) 50vw, 100vw" priority />
            <button className="gallery-main__zoom" type="button" onClick={() => setZoomed(shown.index)} aria-haspopup="dialog">
              <span className="visually-hidden">{t("product.openFullScreen")}</span>
              <Icon name="search" size="sm" />
            </button>
          </>
        ) : (
          <span className="media__label" aria-hidden="true">
            <Icon name="image" />
            {t("product.noPhotoYet")}
          </span>
        )}
        {many ? (
          <>
            <button className="gallery-main__arrow gallery-main__arrow--prev" type="button" aria-label={t("product.previousPhoto")} onClick={() => onSelect(step(current, -1))}>
              <Icon name="chevron-left" />
            </button>
            <button className="gallery-main__arrow gallery-main__arrow--next" type="button" aria-label={t("product.nextPhoto")} onClick={() => onSelect(step(current, 1))}>
              <Icon name="chevron-right" />
            </button>
            <p className="gallery-main__count" aria-live="polite">
              {current + 1} / {images.length}
              <span className="visually-hidden"> {t("product.photos")}</span>
            </p>
          </>
        ) : null}
      </div>
      {many ? (
        <ul className="thumbs" aria-label={t("product.productImages")}>
          {images.map((src, i) => (
            <li key={src + i}>
              <button className="thumb" type="button" aria-pressed={i === shown.index} aria-label={t("product.showImage", { number: i + 1, total: images.length })} onClick={() => onSelect(i)}>
                <span className="media" aria-hidden="true">
                  <StoreImage src={src} alt="" sizes="96px" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <dialog
        ref={dialog}
        className="lightbox"
        aria-label={t("product.productPhotos", { name: productName })}
        onClose={() => setZoomed(null)}
        onKeyDown={(e) => {
          if (!many || zoomed == null || zoomed < 0) return;
          if (e.key === "ArrowRight") setZoomed(step(zoomed, 1));
          if (e.key === "ArrowLeft") setZoomed(step(zoomed, -1));
        }}
      >
        {zoomSrc ? (
          <div className="lightbox__stage" {...(many && zoomed != null && zoomed >= 0 ? swipe((by) => setZoomed(step(zoomed, by))) : {})}>
            <StoreImage src={zoomSrc} alt={zoomAlt} sizes="100vw" />
          </div>
        ) : null}
        <button className="lightbox__close icon-btn" type="button" onClick={() => setZoomed(null)} aria-label={t("product.closeFullScreen")}>
          <Icon name="close" />
        </button>
        {many && zoomed != null && zoomed >= 0 ? (
          <>
            <button className="lightbox__arrow lightbox__arrow--prev" type="button" aria-label={t("product.previousPhoto")} onClick={() => setZoomed(step(zoomed, -1))}>
              <Icon name="chevron-left" />
            </button>
            <button className="lightbox__arrow lightbox__arrow--next" type="button" aria-label={t("product.nextPhoto")} onClick={() => setZoomed(step(zoomed, 1))}>
              <Icon name="chevron-right" />
            </button>
            <p className="lightbox__count" aria-live="polite">
              {t("product.photoCount", { number: zoomed + 1, total: images.length })}
            </p>
          </>
        ) : null}
      </dialog>
    </div>
  );
}
