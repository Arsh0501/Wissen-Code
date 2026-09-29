// Real accounts have no stored colour, so pick a stable one from the name
const PALETTE = ['bg-primary-600', 'bg-emerald-600', 'bg-sky-600', 'bg-amber-600', 'bg-rose-600', 'bg-indigo-600'];

function colorFor(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

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
  user: { name: string; avatarColor?: string } | null;
  size?: 'sm' | 'lg';
}

export default function UserAvatar({ user, size = 'sm' }: UserAvatarProps) {
  if (!user) return null;

  const dimensionClasses = size === 'lg' ? 'w-16 h-16 text-xl' : 'w-8 h-8 text-xs';

  return (
    <div
      className={`${dimensionClasses} ${user.avatarColor || colorFor(user.name)} rounded-full flex items-center justify-center font-semibold text-on-accent shrink-0`}
      aria-hidden="true"
    >
      {getInitials(user.name)}
    </div>
  );
}
