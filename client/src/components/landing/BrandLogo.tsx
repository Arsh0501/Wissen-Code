import "./BrandLogo.css";

export default function BrandLogo({ inverse = false }: { inverse?: boolean }) {
  return (
    <span className={`wissen-brand${inverse ? " wissen-brand-inverse" : ""}`}>
      <svg
        className="wissen-brand-mark"
        viewBox="0 0 48 48"
        fill="none"
        aria-hidden="true"
      >
        <rect width="48" height="48" rx="14" fill="currentColor" />
        <path
          d="m10 16 7 17 7-12 7 12 7-17"
          stroke="white"
          strokeWidth="4.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="37.5" cy="11" r="3.5" fill="#A6F4CE" />
      </svg>
      <span className="wissen-brand-name">
        wissen
        <span>code</span>
      </span>
    </span>
  );
}
