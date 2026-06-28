"use client";

import type { FrontDeskRoomBoardItem } from "@/lib/hms/front-desk-board";
import { getRoomsCapabilities } from "@/lib/hms/rooms-rbac";
import { FrontDeskRoomDetailSheet } from "../rooms/FrontDeskRoomDetailSheet";

/** @deprecated Use FrontDeskRoomDetailSheet directly */
export function FrontDeskRoomDetailModal({
  slug,
  currency,
  room,
  open,
  onOpenChange,
}: {
  slug: string;
  currency: string;
  room: FrontDeskRoomBoardItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const capabilities = getRoomsCapabilities("Front Desk");

  return (
    <FrontDeskRoomDetailSheet
      slug={slug}
      room={room}
      open={open}
      onOpenChange={onOpenChange}
      capabilities={capabilities}
      currency={currency}
      onOpenOp={() => {}}
    />
  );
}
