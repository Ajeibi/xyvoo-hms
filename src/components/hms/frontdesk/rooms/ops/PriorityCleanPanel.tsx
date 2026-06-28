"use client";

import { Input } from "@/components/ui/input";

export function PriorityCleanPanel({
  priority,
  onPriorityChange,
  dueBy,
  onDueByChange,
}: {
  priority: string;
  onPriorityChange: (v: string) => void;
  dueBy: string;
  onDueByChange: (v: string) => void;
}) {
  return (
    <div className="space-y-2">
      <select
        className="h-10 w-full rounded-lg border border-input px-3 text-sm"
        value={priority}
        onChange={(e) => onPriorityChange(e.target.value)}
      >
        <option value="normal">Normal</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
        <option value="vip">VIP priority</option>
      </select>
      <Input
        type="datetime-local"
        value={dueBy}
        onChange={(e) => onDueByChange(e.target.value)}
        aria-label="Due by"
      />
    </div>
  );
}
