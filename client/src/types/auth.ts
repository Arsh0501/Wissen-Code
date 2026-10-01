// Signed-in user, auth context and demo account shapes

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: 'admin' | 'candidate';
  guest?: boolean; // joined through an invite link
}

export interface AuthContextType {
  user: AuthUser | null;
  role: 'admin' | 'candidate';
  candidateName: string;
  isLoggedIn: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<boolean>;
  // Use a token issued elsewhere (e.g. joining through an invite link)
  signInWithToken: (user: AuthUser, token: string) => void;
  logout: () => void;
  updateProfile: (updates: Partial<Pick<AuthUser, 'name' | 'email'>>) => void;
}

export type Role = 'admin' | 'candidate';

export interface MockUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: Role;
  title: string;
  avatarColor: string;
}
