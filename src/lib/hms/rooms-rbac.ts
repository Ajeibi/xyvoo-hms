import { isAdminLikeRole } from "@/lib/hms/department-access";

export type RoomsRoleCapabilities = {
  canViewRooms: boolean;
  canAssignRoom: boolean;
  canMoveGuest: boolean;
  canBlockRoom: boolean;
  canPriorityClean: boolean;
  canRemoteUnlock: boolean;
  canKeyReissue: boolean;
  canManageConnecting: boolean;
  canEditNotes: boolean;
  canLogIncidents: boolean;
  canOverrideDirty: boolean;
  canOverrideBlock: boolean;
  /** Update `room_units.status` (maintenance, dirty, ready, etc.) from front desk. */
  canChangeRoomStatus: boolean;
};

export function getRoomsCapabilities(role: string): RoomsRoleCapabilities {
  const admin = isAdminLikeRole(role);
  const accountant = role === "Accountant" || role === "accountant";
  const manager =
    admin || role === "Manager" || role === "manager" || role === "General Manager";

  return {
    canViewRooms: !accountant || true,
    canAssignRoom: !accountant,
    canMoveGuest: !accountant,
    canBlockRoom: manager || admin,
    canPriorityClean: !accountant,
    canRemoteUnlock: manager || admin,
    canKeyReissue: !accountant,
    canManageConnecting: manager || admin,
    canEditNotes: !accountant,
    canLogIncidents: !accountant,
    canOverrideDirty: manager || admin,
    canOverrideBlock: manager || admin,
    canChangeRoomStatus: !accountant,
  };
}
