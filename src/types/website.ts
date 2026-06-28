export type NavChild = {
  label: string;
  href: string;
  /** Second line in dropdown and mobile grouped nav */
  description?: string;
};

export type NavItemLeaf = { label: string; href: string };

export type NavItemGroup = { label: string; children: NavChild[] };

export type NavItem = NavItemLeaf | NavItemGroup;
