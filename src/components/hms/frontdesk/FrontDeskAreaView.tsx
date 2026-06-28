import type { FrontDeskNavArea } from "@/lib/hms/frontdesk-capabilities";
import { getFrontDeskBlocksForArea } from "@/lib/hms/frontdesk-capabilities";
import type { FrontDeskBoardData } from "@/lib/hms/front-desk-board";
import { FrontDeskDashboard } from "./FrontDeskDashboard";

export function FrontDeskAreaView({
  slug,
  area,
  inventoryRoomCount,
  boardData,
}: {
  slug: string;
  area: FrontDeskNavArea;
  inventoryRoomCount?: number;
  boardData?: FrontDeskBoardData;
}) {
  const blocks = getFrontDeskBlocksForArea(area);
  return (
    <FrontDeskDashboard
      slug={slug}
      area={area}
      blocks={blocks}
      inventoryRoomCount={area === "overview" ? inventoryRoomCount : undefined}
      boardData={area === "overview" ? boardData : undefined}
    />
  );
}
