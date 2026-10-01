// Shareable assessment links

export interface InviteLink {
  id: number;
  token: string;
  assessmentId: number;
  label: string;
  maxUses: number | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  uses: number;
  state: 'active' | 'revoked' | 'expired' | 'full';
  participants: { name: string; email: string; joinedAt: string }[];
}

export interface PublicInvite {
  assessment: {
    name: string;
    description: string;
    timeLimitMinutes: number;
    passingScore: number;
    questionCount: number;
    startAt: string | null;
    endAt: string | null;
  };
  label: string;
  canJoin: boolean;
  problem: string | null;
}
