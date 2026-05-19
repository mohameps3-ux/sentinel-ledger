export default function SentinelLogo({ size = 28, className = "" }) {
  return (
    <div className="flex items-center gap-3 flex-shrink-0">
      {/* Icon — sl-logo-wrapper keeps CSS golden border/bg */}
      <div className="sl-logo-wrapper relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg
          className={`sentinel-icon ${className}`.trim()}
          viewBox="0 0 32 32"
          xmlns="http://www.w3.org/2000/svg"
          style={{ width: size, height: size }}
          role="img"
          aria-label="Sentinel Ledger"
        >
          <defs>
            <radialGradient id="sl-shield-grad" cx="50%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#22D3EE" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#1E3A5F" stopOpacity="0.2" />
            </radialGradient>
          </defs>

          {/* Outer ring — rotates slowly via .sl-logo-hex-outer */}
          <circle
            className="sl-logo-hex-outer"
            cx="16" cy="16" r="14"
            fill="none"
            stroke="#C9A227"
            strokeWidth="0.6"
            opacity="0.5"
          />

          {/* Gold tick nodes at 6 hexagonal positions on the ring */}
          <circle cx="16" cy="2"  r="1.1" fill="#C9A227" className="sl-tick tick-1" />
          <circle cx="28" cy="9"  r="1.1" fill="#C9A227" className="sl-tick tick-2" />
          <circle cx="28" cy="23" r="1.1" fill="#C9A227" className="sl-tick tick-3" />
          <circle cx="16" cy="30" r="1.1" fill="#C9A227" className="sl-tick tick-4" />
          <circle cx="4"  cy="23" r="1.1" fill="#C9A227" className="sl-tick tick-5" />
          <circle cx="4"  cy="9"  r="1.1" fill="#C9A227" className="sl-tick tick-6" />

          {/* Shield polygon with teal gradient fill */}
          <polygon
            points="16,6.5 24.2,11.2 24.2,20.8 16,25.5 7.8,20.8 7.8,11.2"
            fill="url(#sl-shield-grad)"
            stroke="#22D3EE"
            strokeWidth="0.6"
            opacity="0.9"
          />

          {/* Radar sweep — rotates via .sl-logo-radar */}
          <line
            className="sl-logo-radar"
            x1="16" y1="16"
            x2="16" y2="7"
            stroke="#60A5FA"
            strokeWidth="1.2"
            opacity="0.95"
          />

          {/* Center dot — breathes via .sl-logo-center */}
          <circle className="sl-logo-center" cx="16" cy="16" r="2" fill="#C9A227" />
        </svg>
      </div>

      {/* Vertical divider */}
      <div
        aria-hidden="true"
        style={{
          width: 1,
          height: 26,
          flexShrink: 0,
          background: "linear-gradient(to bottom, transparent, rgba(201,162,39,0.55), transparent)"
        }}
      />

      {/* Two-line text: SENTINEL / — LEDGER — */}
      <div className="flex flex-col leading-none gap-[3px] select-none">
        <span
          className="font-display font-bold uppercase whitespace-nowrap"
          style={{ color: "#FFFFFF", fontSize: 13, letterSpacing: "0.28em" }}
        >
          SENTINEL
        </span>
        <div className="flex items-center gap-[5px]">
          <span
            aria-hidden="true"
            style={{ display: "block", height: 1, width: 12, background: "#C9A227", opacity: 0.6, flexShrink: 0 }}
          />
          <span
            className="font-display font-semibold uppercase whitespace-nowrap"
            style={{ color: "#C9A227", fontSize: 8.5, letterSpacing: "0.24em" }}
          >
            LEDGER
          </span>
          <span
            aria-hidden="true"
            style={{ display: "block", height: 1, width: 12, background: "#C9A227", opacity: 0.6, flexShrink: 0 }}
          />
        </div>
      </div>

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
        .sl-tick { opacity: 0.25; }
        .tick-1 { animation: sl-tick-pulse 1.8s ease-in-out infinite 0s; }
        .tick-2 { animation: sl-tick-pulse 1.8s ease-in-out infinite 0.3s; }
        .tick-3 { animation: sl-tick-pulse 1.8s ease-in-out infinite 0.6s; }
        .tick-4 { animation: sl-tick-pulse 1.8s ease-in-out infinite 0.9s; }
        .tick-5 { animation: sl-tick-pulse 1.8s ease-in-out infinite 1.2s; }
        .tick-6 { animation: sl-tick-pulse 1.8s ease-in-out infinite 1.5s; }

        @keyframes sl-hex-rotate {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes sl-radar-sweep {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes sl-center-breathe {
          0%, 100% { transform: scale(1); }
          50%       { transform: scale(1.35); }
        }
        @keyframes sl-tick-pulse {
          0%, 100% { opacity: 0.2; }
          50%       { opacity: 1; }
        }

        .sl-logo-wrapper:hover .sl-logo-hex-outer { animation-duration: 5s; }
        .sl-logo-wrapper:hover .sl-logo-radar     { animation-duration: 0.7s; }
        .sl-logo-wrapper:hover .sl-logo-center    { animation-duration: 0.4s; }
        .sl-logo-wrapper:hover .sl-tick           { animation-duration: 0.6s; }

        .war-mode .sl-logo-radar  { stroke: #FF3B30; }
        .war-mode .sl-logo-center { fill:   #FF3B30; }
      `}</style>
    </div>
  );
}

export { SentinelLogo };
