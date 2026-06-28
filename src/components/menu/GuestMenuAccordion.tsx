import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { formatPricingAmount } from "@/lib/hms/room-pricing";

export type GuestMenuCategory = {
  id: string;
  name: string;
  items: { id: string; name: string; price: number; description: string | null }[];
};

export function GuestMenuAccordion({
  categories,
  currency,
}: {
  categories: GuestMenuCategory[];
  currency: string;
}) {
  if (!categories.length) {
    return (
      <p className="rounded-2xl border border-slate-200 bg-white py-12 text-center text-sm text-slate-500">
        No menu items match your filters.
      </p>
    );
  }

  return (
    <Accordion type="multiple" className="w-full space-y-4">
      {categories.map((category) => (
        <AccordionItem
          key={category.id}
          value={category.id}
          className="overflow-hidden rounded-2xl border border-slate-200 bg-white hover:border-blue-200"
        >
          <AccordionTrigger className="px-6 py-5 hover:no-underline">
            <span className="text-left text-lg font-bold uppercase tracking-wide text-slate-900">
              {category.name}
            </span>
          </AccordionTrigger>
          <AccordionContent className="px-6 pb-6">
            <div className="mt-1 grid gap-3">
              {category.items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-slate-900">{item.name}</p>
                    {item.description ? (
                      <p className="mt-0.5 text-sm text-slate-500">{item.description}</p>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-lg font-bold tabular-nums text-blue-600">
                    {formatPricingAmount(item.price, currency)}
                  </span>
                </div>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}
