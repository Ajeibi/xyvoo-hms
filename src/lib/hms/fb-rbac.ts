import { isAdminLikeRole } from "@/lib/hms/department-access";

export type FbRoleCapabilities = {
  canConfigure: boolean;
  canUsePos: boolean;
  canViewKitchenBoard: boolean;
  canUpdateKitchenStatus: boolean;
  canEightySix: boolean;
  canCloseOrder: boolean;
  canPostFolio: boolean;
  canTakePayment: boolean;
  canVoidOrder: boolean;
  /** Kitchen responses omit prices when true */
  hidePrices: boolean;
};

export function getFbCapabilities(
  membershipRole: string,
  departmentRole: string | null,
): FbRoleCapabilities {
  const admin = isAdminLikeRole(membershipRole);
  const isKitchen = departmentRole === "Kitchen";
  const isFbStaff = departmentRole === "F&B Staff";
  const canOperate = admin || isFbStaff;
  const canKitchen = admin || isKitchen;

  return {
    canConfigure: admin,
    canUsePos: canOperate,
    canViewKitchenBoard: canKitchen || admin,
    canUpdateKitchenStatus: canKitchen || admin,
    canEightySix: canKitchen || admin,
    canCloseOrder: canOperate,
    canPostFolio: canOperate,
    canTakePayment: canOperate,
    canVoidOrder: canOperate,
    hidePrices: isKitchen && !admin,
  };
}

export function assertFbCapability(
  caps: FbRoleCapabilities,
  key: keyof FbRoleCapabilities,
): string | null {
  if (!caps[key]) {
    return "You do not have permission for this action.";
  }
  return null;
}
