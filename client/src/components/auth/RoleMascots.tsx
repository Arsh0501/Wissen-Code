import type { SVGProps } from "react";

/**
 * Two friendly characters for the login chooser. Soft shapes, no hard outlines,
 * brand hues only: violet for the hiring team, green for candidates.
 */
type Props = SVGProps<SVGSVGElement> & { size?: number };

export function AdminMascot({ size = 104, ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {/* shirt */}
      <path
        d="M24 120v-22c0-11 9-19 20-19h32c11 0 20 8 20 19v22Z"
        fill="#8055df"
      />
      {/* collar + tie */}
      <path d="M48 79h24l-12 12Z" fill="#fff" />
      <path d="M60 88l-5 8 5 20 5-20Z" fill="#5f3ab3" />
      {/* neck */}
      <rect x="52" y="68" width="16" height="14" rx="6" fill="#f3c6a5" />
      {/* head */}
      <circle cx="60" cy="50" r="29" fill="#fbd9c2" />
      {/* hair */}
      <path
        d="M31 50c0-18 13-30 29-30s29 12 29 30c0 2-1 3-2 3-6-10-14-14-27-14S39 43 33 53c-1 0-2-1-2-3Z"
        fill="#4b3a5a"
      />
      {/* ears */}
      <circle cx="31" cy="54" r="4" fill="#f3c6a5" />
      <circle cx="89" cy="54" r="4" fill="#f3c6a5" />
      {/* glasses */}
      <circle cx="49" cy="55" r="8" fill="#fff" fillOpacity=".55" stroke="#4b3a5a" strokeWidth="2.4" />
      <circle cx="71" cy="55" r="8" fill="#fff" fillOpacity=".55" stroke="#4b3a5a" strokeWidth="2.4" />
      <path d="M57 55h6" stroke="#4b3a5a" strokeWidth="2.4" strokeLinecap="round" />
      {/* eyes */}
      <circle cx="49.5" cy="56" r="2.6" fill="#2d2436" />
      <circle cx="71.5" cy="56" r="2.6" fill="#2d2436" />
      {/* cheeks */}
      <circle cx="42" cy="64" r="3.5" fill="#ff9eb5" fillOpacity=".7" />
      <circle cx="78" cy="64" r="3.5" fill="#ff9eb5" fillOpacity=".7" />
      {/* smile */}
      <path
        d="M53 66q7 6 14 0"
        fill="none"
        stroke="#9a4f3f"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      {/* clipboard */}
      <g transform="rotate(-8 96 96)">
        <rect x="82" y="76" width="26" height="32" rx="5" fill="#fff" stroke="#d6c8f3" strokeWidth="2" />
        <rect x="90" y="72" width="10" height="7" rx="2.5" fill="#c9aff5" />
        <path d="M88 90l4 4 8-9" fill="none" stroke="#65a30d" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M88 101h14" stroke="#e5dcf7" strokeWidth="2.4" strokeLinecap="round" />
      </g>
      {/* hand on clipboard */}
      <circle cx="84" cy="106" r="6" fill="#f3c6a5" />
    </svg>
  );
}

export function CandidateMascot({ size = 104, ...rest }: Props) {
  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {/* t-shirt */}
      <path
        d="M24 120v-22c0-11 9-19 20-19h32c11 0 20 8 20 19v22Z"
        fill="#65a30d"
      />
      {/* neckline */}
      <path d="M48 79q12 10 24 0v4q-12 8-24 0Z" fill="#4d7c0f" />
      {/* lanyard + ID badge */}
      <path d="M52 82l6 16M68 82l-6 16" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeOpacity=".9" />
      <rect x="51" y="97" width="18" height="20" rx="3.5" fill="#fff" />
      <circle cx="60" cy="104" r="3.2" fill="#c9aff5" />
      <path d="M55 111h10" stroke="#d6c8f3" strokeWidth="2.2" strokeLinecap="round" />
      {/* neck */}
      <rect x="52" y="68" width="16" height="14" rx="6" fill="#d9a579" />
      {/* headphones resting on the neck */}
      <path d="M42 76q18 16 36 0" fill="none" stroke="#2f2a3a" strokeWidth="4" strokeLinecap="round" />
      <circle cx="42" cy="76" r="4.5" fill="#2f2a3a" />
      <circle cx="78" cy="76" r="4.5" fill="#2f2a3a" />
      {/* head */}
      <circle cx="60" cy="50" r="29" fill="#e8b88f" />
      {/* side-swept hair */}
      <path
        d="M31 50c0-18 13-30 29-30 18 0 30 14 29 32-5-10-13-14-24-14-4 0-8 2-11 5-7-4-16-2-23 7Z"
        fill="#2b2024"
      />
      <path d="M77 22c6 2 10 7 12 13-4-3-8-4-12-4Z" fill="#2b2024" />
      {/* ears */}
      <circle cx="31" cy="54" r="4" fill="#d9a579" />
      <circle cx="89" cy="54" r="4" fill="#d9a579" />
      {/* brows */}
      <path d="M44 47q5-3 10 0M66 47q5-3 10 0" fill="none" stroke="#2b2024" strokeWidth="2" strokeLinecap="round" />
      {/* eyes */}
      <circle cx="49" cy="55" r="3" fill="#2b2024" />
      <circle cx="71" cy="55" r="3" fill="#2b2024" />
      <circle cx="50" cy="54" r="1" fill="#fff" />
      <circle cx="72" cy="54" r="1" fill="#fff" />
      {/* cheeks */}
      <circle cx="42" cy="63" r="3.5" fill="#ff9eb5" fillOpacity=".7" />
      <circle cx="78" cy="63" r="3.5" fill="#ff9eb5" fillOpacity=".7" />
      {/* smile */}
      <path d="M52 64q8 8 16 0Z" fill="#fff" stroke="#9a4f3f" strokeWidth="2.2" strokeLinejoin="round" />
      {/* laptop held at the side */}
      <g transform="rotate(6 96 96)">
        <rect x="82" y="78" width="28" height="22" rx="3.5" fill="#2f2a3a" />
        <rect x="85" y="81" width="22" height="16" rx="2" fill="#3f3850" />
        <text
          x="96"
          y="93"
          textAnchor="middle"
          fontFamily="JetBrains Mono, Consolas, monospace"
          fontSize="9"
          fontWeight="700"
          fill="#bef264"
        >
          {"</>"}
        </text>
        <rect x="79" y="100" width="34" height="5" rx="2.5" fill="#4a425c" />
      </g>
      {/* hand */}
      <circle cx="84" cy="108" r="6" fill="#d9a579" />
      {/* spark */}
      <path d="M102 22l2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="#ffd166" />
    </svg>
  );
}
