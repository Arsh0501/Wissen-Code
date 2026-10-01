import type { Role, NavItem } from '../../types';
import { NAV_ITEMS } from '../../constants';

export function getNavItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
