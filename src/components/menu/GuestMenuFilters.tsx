import { Filter } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OutletOption = { id: string; name: string };

export function GuestMenuFilters({
  outlets,
  categories,
  selectedOutlet,
  onOutletChange,
  selectedCategory,
  onCategoryChange,
  sortOrder,
  onSortOrderChange,
}: {
  outlets: OutletOption[];
  categories: { id: string; name: string }[];
  selectedOutlet: string;
  onOutletChange: (value: string) => void;
  selectedCategory: string;
  onCategoryChange: (value: string) => void;
  sortOrder: string;
  onSortOrderChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-4 md:flex-row">
      <div className="flex items-center gap-2 text-slate-500">
        <Filter className="h-5 w-5" />
        <span className="text-sm font-medium">Filter menu</span>
      </div>

      <Select value={selectedOutlet} onValueChange={onOutletChange}>
        <SelectTrigger className="w-[240px] border-slate-200 bg-white">
          <SelectValue placeholder="Outlet" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All outlets</SelectItem>
          {outlets.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedCategory} onValueChange={onCategoryChange}>
        <SelectTrigger className="w-[240px] border-slate-200 bg-white">
          <SelectValue placeholder="Category" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All categories</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={sortOrder} onValueChange={onSortOrderChange}>
        <SelectTrigger className="w-[240px] border-slate-200 bg-white">
          <SelectValue placeholder="Sort by price" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="default">Default order</SelectItem>
          <SelectItem value="low-to-high">Price: low to high</SelectItem>
          <SelectItem value="high-to-low">Price: high to low</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
