import { z } from "zod";
import type { HotelRoomTypeSetup } from "@/lib/hms/room-pricing";
import { isHotelTemplateId } from "./constants";

/** What a hotel still has to set before its website can go live; empty means it can publish. */
export function missingForPublish(input: {
  templateId: string | null;
  address: string | null;
  reservationsEmail: string | null;
  roomTypes: Pick<HotelRoomTypeSetup, "baseRate">[];
}): string[] {
  const missing: string[] = [];
  if (!isHotelTemplateId(input.templateId)) missing.push("Choose a template");
  if (!input.address) missing.push("Choose a web address");
  if (!input.roomTypes.some((r) => Number.isFinite(r.baseRate) && r.baseRate > 0)) missing.push("Add a room type with a rate in Rooms and pricing");
  if (!input.reservationsEmail) missing.push("Add a reservations email");
  return missing;
}

export const reservationsEmailSchema = z.string().trim().toLowerCase().email("Enter a valid email address.").max(160);
