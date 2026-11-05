import type { FbKitchenTicket } from "@/lib/hms/fb-types";

export function filterKitchenTicketsByStation(
  tickets: FbKitchenTicket[],
  stationCode: string,
): FbKitchenTicket[] {
  if (stationCode === "all") return tickets;
  // Held look-ahead is per order, so a station view keeps only tickets with its own fired work.
  return tickets
    .map((ticket) => ({
      ...ticket,
      items: ticket.items.filter((item) => item.station_code === stationCode),
    }))
    .filter((ticket) => ticket.items.length > 0);
}
