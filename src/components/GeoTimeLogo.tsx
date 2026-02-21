interface GeoTimeLogoProps {
  size?: number;
  className?: string;
}

const GeoTimeLogo = ({ size = 28, className = '' }: GeoTimeLogoProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Purple background circle */}
    <circle cx="16" cy="16" r="16" fill="#7c3aed" />
    {/* Location pin */}
    <path
      d="M16 6C12.13 6 9 9.13 9 13c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
      fill="white"
    />
    {/* Clock face */}
    <circle cx="16" cy="13" r="3.2" fill="#7c3aed" />
    {/* Hour hand (~10 o'clock) */}
    <line x1="16" y1="13" x2="14.7" y2="11.5" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
    {/* Minute hand (~3 o'clock) */}
    <line x1="16" y1="13" x2="17.8" y2="13" stroke="white" strokeWidth="1.1" strokeLinecap="round" />
    {/* Center dot */}
    <circle cx="16" cy="13" r="0.5" fill="white" />
  </svg>
);

export default GeoTimeLogo;
