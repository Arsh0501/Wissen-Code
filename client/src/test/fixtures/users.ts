// Accounts used by the frontend test suite.

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

export const MOCK_USERS: MockUser[] = [
  {
    id: 'u-admin-1',
    name: 'Ava Patel',
    email: 'admin@wissen.dev',
    password: 'Admin@123',
    role: 'admin',
    title: 'Platform Administrator',
    avatarColor: 'bg-primary-600',
  },
  {
    id: 'u-candidate-1',
    name: 'Rahul Singh',
    email: 'rahul@wissen.dev',
    password: 'Candidate@123',
    role: 'candidate',
    title: 'Candidate',
    avatarColor: 'bg-emerald-600',
  },
  {
    id: 'u-candidate-2',
    name: 'Maria Gomez',
    email: 'maria@wissen.dev',
    password: 'Candidate@123',
    role: 'candidate',
    title: 'Candidate',
    avatarColor: 'bg-amber-600',
  },
];

export function findUserByCredentials(
  email: string,
  password: string,
): MockUser | undefined {
  const normalizedEmail = email.trim().toLowerCase();
  return MOCK_USERS.find(
    (u) => u.email.toLowerCase() === normalizedEmail && u.password === password,
  );
}
