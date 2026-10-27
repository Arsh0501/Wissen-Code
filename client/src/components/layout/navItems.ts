import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  ClipboardList,
  FileText,
  UserCircle,
  Sparkles,
  MessagesSquare,
} from 'lucide-react';
import type { Role } from '../../context/AuthContext';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  // Only matches the exact path — prevents parent items from staying highlighted on child routes.
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['admin', 'candidate', 'interviewer'],
    end: true,
  },
  {
    to: '/admin/questions',
    label: 'Question Bank',
    icon: FileText,
    roles: ['admin'],
    end: false,
  },
  {
    to: '/admin/assessments',
    label: 'Assessments',
    icon: ClipboardList,
    roles: ['admin'],
  },
  {
    to: '/admin/ai-questions',
    label: 'AI Questions',
    icon: Sparkles,
    roles: ['admin'],
  },
  {
    to: '/admin/interviews',
    label: 'Interviews',
    icon: MessagesSquare,
    roles: ['admin', 'interviewer'],
  },
  { to: '/admin/team', label: 'Team Access', icon: UserCircle, roles: ['admin'] },
  {
    to: '/profile',
    label: 'Profile',
    icon: UserCircle,
    roles: ['admin', 'candidate', 'interviewer'],
  },
];

export function getNavItemsForRole(role: Role, accessRole?: string): NavItem[] {
  const effectiveRole = accessRole || role;
  return NAV_ITEMS.filter(
    (item) =>
      item.roles.includes(role) &&
      (effectiveRole !== 'interviewer' || ['/', '/admin/interviews', '/profile'].includes(item.to)),
  );
}
