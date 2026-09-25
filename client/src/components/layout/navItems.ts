import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, ClipboardList, FileText, UserCircle } from 'lucide-react';
import type { Role } from '../../data/mockUsers';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  // Only matches the exact path — prevents parent items from staying highlighted on child routes.
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'examinee'], end: true },
  { to: '/admin', label: 'Question Bank', icon: FileText, roles: ['admin'], end: true },
  { to: '/admin/assessments', label: 'Assessments', icon: ClipboardList, roles: ['admin'] },
  { to: '/exam', label: 'My Assessments', icon: ClipboardList, roles: ['examinee'], end: true },
  { to: '/profile', label: 'Profile', icon: UserCircle, roles: ['admin', 'examinee'] },
];

export function getNavItemsForRole(role: Role): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
