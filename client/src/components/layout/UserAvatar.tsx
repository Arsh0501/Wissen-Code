import styles from './UserAvatar.module.css';
import type { UserAvatarProps } from '../../types';
// Real accounts have no stored colour, so pick a stable one from the name
const PALETTE = [styles.palettePrimary, styles.paletteEmerald, styles.paletteSky, styles.paletteAmber, styles.paletteRose, styles.paletteIndigo];

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

export default function UserAvatar({ user, size = 'sm' }: UserAvatarProps) {
  if (!user) return null;

  const dimensionClasses = size === 'lg' ? styles.dimensionLg : styles.dimensionDefault;

  return (
    <div
      className={`${styles.box} ${dimensionClasses} ${user.avatarColor || colorFor(user.name)}`}
      aria-hidden="true"
    >
      {getInitials(user.name)}
    </div>
  );
}
