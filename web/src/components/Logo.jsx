export default function Logo({ className = 'size-8' }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <rect width="64" height="64" rx="14" fill="#141d31" />
      <path d="M32 10 52 52H42.5L32 29 21.5 52H12z" fill="#2dd4bf" />
      <path d="M26 44h12l-2.6-6h-6.8z" fill="#f59e0b" />
    </svg>
  );
}
