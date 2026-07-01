/** Item is unavailable for new orders (kitchen 86 or manually marked off). */
export function isMenuItemSoldOut(item: {
  is_available: boolean;
  eighty_sixed_at?: string | null;
}) {
  return !item.is_available || Boolean(item.eighty_sixed_at);
}
