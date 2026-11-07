export default function Logo({ className = 'size-8' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#1b1d21" />
      <rect x="30.5" y="4" width="3" height="22" rx="1.5" fill="url(#lg-beam)" />
      <path d="M32 14 L41 25 L44 56 L20 56 L23 25 Z" fill="#25282d" stroke="#464b53" strokeWidth="1.2" />
      <path d="M32 28 L36 34 L32 40 L28 34 Z" fill="#6fe3e1" />
      <defs>
        <linearGradient id="lg-beam" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0" stopColor="#6fe3e1" />
          <stop offset="1" stopColor="#6fe3e1" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
}
