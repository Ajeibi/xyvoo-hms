/**
 * Shared TypeScript types. Import from `@/types` or `@/types/<module>`.
 */

export type { NavChild, NavItemLeaf, NavItemGroup, NavItem } from "./website";
export type { WithChildren, FadeInSectionProps } from "./react-ui";
export type { MarketingContactForm, MarketingTeamAvatarProps, MarketingIconFeature } from "./marketing";
export type {
  HotelDashboardTourStatus,
  HotelMembershipRow,
  HotelTenantCore,
  HotelTenantBySlugRow,
  HotelTenantListRow,
  HotelProfileRoomCountRow,
  HotelProfileTourStatusRow,
  HotelProfileDirectoryRow,
  HotelRegistrationSessionRow,
} from "./hotel-db";
export type { HotelRegisterBillingCycle, HotelRegisterHotelDraft, HotelRegisterAccountDraft } from "./hotel-register";
export type { RoleSection, ModuleScaffoldProps } from "./hms";
export type { LocationLookupKind, LocationNominatimRow, LocationAddressOption, LocationCityOption } from "./location";
export type { PlatformTenant } from "./platform";
export type { HomePricingTab, HomeStorePlan, HomeHmsCycle } from "./pricing";
