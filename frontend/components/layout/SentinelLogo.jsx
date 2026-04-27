export default function SentinelLogo({ size = 22, className = "" }) {
  return (
    <div className="flex items-center gap-2.5 flex-shrink-0">
      <div className="sl-logo-wrapper relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg
          className={`sentinel-icon ${className}`.trim()}
          viewBox="0 0 32 32"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: size, height: size }}
          role="img"
          aria-label="Sentinel Ledger"
        >
          <polygon
            className="sl-logo-hex-outer"
            points="16,1 25,5 31,14 31,18 25,27 16,31 7,27 1,18 1,14 7,5"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="0.6"
            opacity="0.4"
          />

          <circle cx="16" cy="1" r="1" fill="#fbbf24" className="sl-tick tick-1" />
          <circle cx="25" cy="5" r="1" fill="#fbbf24" className="sl-tick tick-2" />
          <circle cx="31" cy="14" r="1" fill="#fbbf24" className="sl-tick tick-3" />
          <circle cx="31" cy="18" r="1" fill="#fbbf24" className="sl-tick tick-4" />
          <circle cx="25" cy="27" r="1" fill="#fbbf24" className="sl-tick tick-5" />
          <circle cx="16" cy="31" r="1" fill="#fbbf24" className="sl-tick tick-6" />
          <circle cx="7" cy="27" r="1" fill="#fbbf24" className="sl-tick tick-7" />
          <circle cx="1" cy="14" r="1" fill="#fbbf24" className="sl-tick tick-8" />

          <polygon
            points="16,7 21,9.5 24,14 24,18 21,22.5 16,25 11,22.5 8,18 8,14 11,9.5"
            fill="none"
            stroke="#f59e0b"
            strokeWidth="0.8"
            opacity="0.55"
          />

          <line x1="8" y1="16" x2="13" y2="16" stroke="#fafafa" strokeWidth="0.8" opacity="0.5" />
          <line x1="19" y1="16" x2="24" y2="16" stroke="#fafafa" strokeWidth="0.8" opacity="0.5" />
          <line x1="16" y1="8" x2="16" y2="13" stroke="#fafafa" strokeWidth="0.8" opacity="0.5" />
          <line x1="16" y1="19" x2="16" y2="24" stroke="#fafafa" strokeWidth="0.8" opacity="0.5" />

          <line
            className="sl-logo-radar"
            x1="16"
            y1="16"
            x2="16"
            y2="2"
            stroke="#fbbf24"
            strokeWidth="1.2"
            opacity="0.95"
          />

          <circle className="sl-logo-center" cx="16" cy="16" r="2.2" fill="#fbbf24" />
        </svg>
      </div>

      <span className="font-display text-[13px] font-bold text-sl-text tracking-[0.1em] uppercase whitespace-nowrap">
        SENTINEL LEDGER
      </span>

      <style jsx global>{`
        .sl-logo-hex-outer {
          transform-origin: 16px 16px;
          animation: sl-hex-rotate 20s linear infinite;
        }

        .sl-logo-radar {
          transform-origin: 16px 16px;
          animation: sl-radar-sweep 3s linear infinite;
        }

        .sl-logo-center {
          transform-origin: 16px 16px;
          animation: sl-center-breathe 2s ease-in-out infinite;
        }

        .sl-tick {
          opacity: 0.2;
        }
        .tick-1 {
          animation: sl-tick-pulse 2.4s ease-in-out infinite 0s;
        }
        .tick-2 {
          animation: sl-tick-pulse 2.4s ease-in-out infinite 0.3s;
        }
        .tick-3 {
          animation: sl-tick-pulse 2.4s ease-in-out infinite 0.6s;
        }
        .tick-4 {
          animation: sl-tick-pulse 2.4s ease-in-out infinite 0.9s;
        }
        .tick-5 {
          animation: sl-tick-pulse 2.4s ease-in-out infinite 1.2s;
        }
        .tick-6 {
          animation: sl-tick-pulse 2.4s ease-in-out infinite 1.5s;
        }
        .tick-7 {
          animation: sl-tick-pulse 2.4s ease-in-out infinite 1.8s;
        }
        .tick-8 {
          animation: sl-tick-pulse 2.4s ease-in-out infinite 2.1s;
        }

        @keyframes sl-hex-rotate {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes sl-radar-sweep {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes sl-center-breathe {
          0%,
          100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.35);
          }
        }

        @keyframes sl-tick-pulse {
          0%,
          100% {
            opacity: 0.15;
          }
          50% {
            opacity: 1;
          }
        }

        .sl-logo-wrapper:hover .sl-logo-hex-outer {
          animation-duration: 5s;
        }
        .sl-logo-wrapper:hover .sl-logo-radar {
          animation-duration: 0.7s;
        }
        .sl-logo-wrapper:hover .sl-logo-center {
          animation-duration: 0.4s;
        }
        .sl-logo-wrapper:hover .sl-tick {
          animation-duration: 0.6s;
        }

        .war-mode .sl-logo-radar {
          stroke: #DC2626;
        }
        .war-mode .sl-logo-center {
          fill: #DC2626;
        }
      `}</style>
    </div>
  );
}

export { SentinelLogo };
