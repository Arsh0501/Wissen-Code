// Shared UI component shapes
import type { LucideIcon } from 'lucide-react';
import type { Role } from './auth';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: Role[];
  // Only matches the exact path — prevents parent items from staying highlighted on child routes.
  end?: boolean;
}

export interface UserAvatarProps {
  user: { name: string; avatarColor?: string } | null;
  size?: 'sm' | 'lg';
}

export type StatusTone = { pill: string; stripe: string };

export interface TabSwitchEvent {
  leftAt: Date;
  durationMs: number;
}
