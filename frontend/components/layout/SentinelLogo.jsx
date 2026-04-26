export function SentinelLogo({ className = "" }) {
  return (
    <span className={`sl-logo-wrapper inline-flex h-8 w-8 items-center justify-center ${className}`.trim()} aria-label="Sentinel">
      <svg viewBox="0 0 32 32" className="h-8 w-8" role="img" aria-hidden="true">
        <defs>
          <linearGradient id="radarGrad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#6366F1" stopOpacity="0" />
            <stop offset="100%" stopColor="#6366F1" stopOpacity="1" />
          </linearGradient>
        </defs>
        <g className="sl-logo-hex-outer">
          <polygon
            points="16,2 28,9 28,23 16,30 4,23 4,9"
            fill="none"
            stroke="#6366F1"
            strokeWidth="0.5"
            opacity="0.4"
          />
        </g>
        <circle cx="16" cy="2" r="1" fill="#6366F1" className="tick tick-1" />
        <circle cx="28" cy="9" r="1" fill="#6366F1" className="tick tick-2" />
        <circle cx="28" cy="23" r="1" fill="#6366F1" className="tick tick-3" />
        <circle cx="16" cy="30" r="1" fill="#6366F1" className="tick tick-4" />
        <circle cx="4" cy="23" r="1" fill="#6366F1" className="tick tick-5" />
        <circle cx="4" cy="9" r="1" fill="#6366F1" className="tick tick-6" />
        <polygon
          points="16,7 23,11.5 23,20.5 16,25 9,20.5 9,11.5"
          fill="none"
          stroke="#6366F1"
          strokeWidth="0.8"
          opacity="0.6"
        />
        <line
          x1="16"
          y1="16"
          x2="16"
          y2="3"
          stroke="url(#radarGrad)"
          strokeWidth="1.5"
          className="sl-logo-radar"
        />
        <circle cx="16" cy="16" r="2" fill="#6366F1" className="sl-logo-center" />
        <text x="16" y="18.8" textAnchor="middle" fontSize="6" fontWeight="700" fill="#E2E8F0" fontFamily="monospace">
          S
        </text>
      </svg>
    </span>
  );
}
