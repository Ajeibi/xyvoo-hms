export type RoomOpsAction =
  | "change-assignment"
  | "block"
  | "unlock"
  | "priority-clean"
  | "key-reissue"
  | "move"
  | "connecting";

export type RoomOption = { id: string; roomCode: string; displayStatus: string };

export const ROOM_OPS_TITLES: Record<RoomOpsAction, string> = {
  "change-assignment": "Change room assignment",
  block: "Block room",
  unlock: "Remote unlock",
  "priority-clean": "Priority clean request",
  "key-reissue": "Lost key / reissue",
  move: "Move guest",
  connecting: "Link connecting rooms",
};
