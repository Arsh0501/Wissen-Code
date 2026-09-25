import type { MockUser } from '../../data/mockUsers';

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

interface UserAvatarProps {
  user: MockUser | null;
  size?: 'sm' | 'lg';
}

export default function UserAvatar({ user, size = 'sm' }: UserAvatarProps) {
  if (!user) return null;

  const dimensionClasses = size === 'lg' ? 'w-16 h-16 text-xl' : 'w-8 h-8 text-xs';

  return (
    <div
      className={`${dimensionClasses} ${user.avatarColor} rounded-full flex items-center justify-center font-semibold text-white shrink-0`}
      aria-hidden="true"
    >
      {getInitials(user.name)}
    </div>
  );
}
