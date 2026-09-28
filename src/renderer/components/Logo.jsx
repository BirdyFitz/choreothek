// Programmsymbol (wie build/icon-small.svg) für die Kopfleiste
export default function Logo({ size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" aria-hidden="true">
      <rect x="8" y="8" width="240" height="240" rx="52" fill="#0F6E56" />
      <path d="M186 80 A72 72 0 1 0 186 176" fill="none" stroke="#ffffff" strokeWidth="34" strokeLinecap="round" />
      <rect x="130" y="86" width="14" height="70" fill="#9FE1CB" />
      <ellipse cx="124" cy="156" rx="20" ry="16" fill="#9FE1CB" />
    </svg>
  )
}
