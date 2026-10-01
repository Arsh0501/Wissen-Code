import type { InviteLink } from '../types';

export const INVITE_STATE_LABELS: Record<InviteLink['state'], string> = {
  active: 'Active',
  revoked: 'Turned off',
  expired: 'Expired',
  full: 'Limit reached',
};
