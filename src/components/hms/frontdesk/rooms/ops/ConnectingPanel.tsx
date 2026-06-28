"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function ConnectingPanel({
  roomBCode,
  onRoomBCodeChange,
  connectingHint,
  connectingLinks,
  onUnlink,
}: {
  roomBCode: string;
  onRoomBCodeChange: (v: string) => void;
  connectingHint: string | null;
  connectingLinks: { id: string; roomA?: { room_code: string }; roomB?: { room_code: string } }[];
  onUnlink: (linkId: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-600">Link second room number</p>
      <Input placeholder="e.g. 204" value={roomBCode} onChange={(e) => onRoomBCodeChange(e.target.value)} />
      {roomBCode.trim() ? <p className="text-xs text-slate-500">{connectingHint}</p> : null}
      <p className="text-xs font-medium text-slate-600">Existing pairs</p>
      <ul className="max-h-32 space-y-1 overflow-y-auto text-xs">
        {connectingLinks.map((l) => (
          <li key={l.id} className="flex items-center justify-between gap-2">
            <span>
              {l.roomA?.room_code} ↔ {l.roomB?.room_code}
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={() => onUnlink(l.id)}>
              Unlink
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
