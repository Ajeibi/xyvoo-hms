"use client";

import { useMemo, useState } from "react";
import { ImageOff, Minus, Plus } from "lucide-react";
import { formatShopCurrency } from "@/lib/shop/format";
import { useCartStore } from "@/components/shop/CartProvider";
import type { ShopProduct, ShopProductVariant } from "@/lib/shop/products";
import { toastSuccess } from "@/lib/app-toast";

function findMatchingVariant(
  variants: ShopProductVariant[],
  selected: Record<string, string>,
): ShopProductVariant | null {
  if (variants.length === 0) return null;
  return (
    variants.find((v) => Object.entries(selected).every(([key, value]) => v.options[key] === value)) || null
  );
}

export default function ProductDetailClient({ product }: { product: ShopProduct }) {
  const addLine = useCartStore((s) => s.addLine);

  const images = product.imageUrls.length > 0 ? product.imageUrls : product.imageUrl ? [product.imageUrl] : [];
  const [activeImage, setActiveImage] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState(product.minimumOrderQty || 1);

  const hasVariants = product.productOptions.length > 0 && product.variants.length > 0;
  const selectedVariant = hasVariants ? findMatchingVariant(product.variants, selectedOptions) : null;
  const allOptionsSelected = product.productOptions.every((opt) => selectedOptions[opt.name]);

  const activePrice = selectedVariant?.priceOverride ?? product.price;
  const activeStock = selectedVariant ? selectedVariant.stock : product.stock;
  const canAddToCart = product.allowBackorder || activeStock > 0;
  const maxQuantity = product.allowBackorder ? Infinity : Math.max(activeStock, 0);

  const variantLabel = useMemo(() => {
    if (!selectedVariant) return null;
    return Object.entries(selectedVariant.options)
      .map(([, v]) => v)
      .join(" / ");
  }, [selectedVariant]);

  const handleAddToCart = () => {
    if (hasVariants && !allOptionsSelected) return;

    addLine({
      productId: product.id,
      variantId: selectedVariant?.id || null,
      name: product.name,
      variantLabel,
      imageUrl: selectedVariant?.imageUrl || product.imageUrl,
      unitPrice: activePrice,
      currency: product.currency,
      quantity,
      maxQuantity: Number.isFinite(maxQuantity) ? maxQuantity : 999,
    });

    toastSuccess("Added to cart", product.name);
  };

  return (
    <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
      <div>
        <div className="flex aspect-square items-center justify-center overflow-hidden rounded-2xl bg-slate-50">
          {images[activeImage] ? (
            <img src={images[activeImage]} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <ImageOff className="h-10 w-10 text-slate-300" />
          )}
        </div>
        {images.length > 1 ? (
          <div className="mt-3 flex gap-2">
            {images.map((img, i) => (
              <button
                key={img + i}
                type="button"
                onClick={() => setActiveImage(i)}
                className={`h-16 w-16 overflow-hidden rounded-lg border ${
                  i === activeImage ? "border-xyvoo-blue" : "border-slate-200"
                }`}
              >
                <img src={img} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div>
        {product.brand ? <p className="text-xs uppercase tracking-wide text-slate-400">{product.brand}</p> : null}
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{product.name}</h1>

        <div className="mt-3 flex items-center gap-3">
          <span className="text-2xl font-bold text-slate-900">{formatShopCurrency(activePrice, product.currency)}</span>
          {product.compareAtPrice && product.compareAtPrice > activePrice ? (
            <span className="text-sm text-slate-400 line-through">
              {formatShopCurrency(product.compareAtPrice, product.currency)}
            </span>
          ) : null}
        </div>

        {product.shortDescription ? <p className="mt-4 text-sm text-slate-600">{product.shortDescription}</p> : null}

        {product.productOptions.map((opt) => (
          <div key={opt.name} className="mt-5">
            <p className="mb-2 text-xs font-medium text-slate-600">{opt.name}</p>
            <div className="flex flex-wrap gap-2">
              {opt.values.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSelectedOptions((prev) => ({ ...prev, [opt.name]: value }))}
                  className={`rounded-lg border px-3 py-1.5 text-sm ${
                    selectedOptions[opt.name] === value
                      ? "border-xyvoo-blue bg-blue-50 text-xyvoo-blue"
                      : "border-slate-200 text-slate-700 hover:border-slate-300"
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        ))}

        <div className="mt-6 flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-slate-200">
            <button
              type="button"
              aria-label="Decrease quantity"
              onClick={() => setQuantity((q) => Math.max(product.minimumOrderQty || 1, q - 1))}
              className="p-2.5 text-slate-500 hover:text-slate-800"
            >
              <Minus className="h-4 w-4" />
            </button>
            <span className="w-10 text-center text-sm font-medium">{quantity}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setQuantity((q) => Math.min(q + 1, Number.isFinite(maxQuantity) ? maxQuantity : q + 1))}
              className="p-2.5 text-slate-500 hover:text-slate-800"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            disabled={!canAddToCart || (hasVariants && !allOptionsSelected)}
            onClick={handleAddToCart}
            className="flex-1 rounded-lg bg-xyvoo-blue py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          >
            {!canAddToCart
              ? "Out of stock"
              : hasVariants && !allOptionsSelected
                ? "Select options"
                : "Add to cart"}
          </button>
        </div>

        {product.description ? (
          <div className="mt-8 border-t border-slate-100 pt-6 text-sm leading-relaxed text-slate-600">
            {product.description}
          </div>
        ) : null}
      </div>
    </div>
  );
}
