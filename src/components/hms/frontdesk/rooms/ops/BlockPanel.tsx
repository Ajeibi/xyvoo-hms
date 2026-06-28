"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function BlockPanel({
  blockType,
  onBlockTypeChange,
  blockStart,
  onBlockStartChange,
  blockEnd,
  onBlockEndChange,
  activeBlocks,
  onDeactivateBlock,
}: {
  blockType: string;
  onBlockTypeChange: (v: string) => void;
  blockStart: string;
  onBlockStartChange: (v: string) => void;
  blockEnd: string;
  onBlockEndChange: (v: string) => void;
  activeBlocks: { id: string; reason: string; block_type: string }[];
  onDeactivateBlock?: (blockId: string) => void;
}) {
  return (
    <>
      <select
        className="h-10 w-full rounded-lg border border-input px-3 text-sm"
        value={blockType}
        onChange={(e) => onBlockTypeChange(e.target.value)}
      >
        <option value="temporary">Temporary</option>
        <option value="permanent">Permanent</option>
        <option value="soft">Soft block</option>
        <option value="maintenance_hold">Maintenance hold</option>
      </select>
      <div className="grid gap-2 sm:grid-cols-2">
        <Input type="datetime-local" value={blockStart} onChange={(e) => onBlockStartChange(e.target.value)} />
        <Input type="datetime-local" value={blockEnd} onChange={(e) => onBlockEndChange(e.target.value)} />
      </div>
      {activeBlocks.length > 0 ? (
        <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-slate-600">
          {activeBlocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2 rounded border bg-white px-2 py-1">
              <span>
                {b.block_type}: {b.reason}
              </span>
              {onDeactivateBlock ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => onDeactivateBlock(b.id)}>
                  End
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
