import { LayoutDashboard, ClipboardList, FileText, UserCircle, MessagesSquare } from 'lucide-react';
import type { NavItem } from '../types';

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'candidate'], end: true },
  { to: '/admin/questions', label: 'Question Bank', icon: FileText, roles: ['admin'], end: false },
  { to: '/admin/assessments', label: 'Assessments', icon: ClipboardList, roles: ['admin'] },
  { to: '/admin/interviews', label: 'Interviews', icon: MessagesSquare, roles: ['admin'] },
  { to: '/profile', label: 'Profile', icon: UserCircle, roles: ['admin', 'candidate'] },
];
