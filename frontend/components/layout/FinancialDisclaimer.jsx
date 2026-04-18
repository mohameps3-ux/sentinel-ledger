export function FinancialDisclaimer({ className = "" }) {
  return (
    <div
      className={`text-xs text-gray-500 text-center leading-relaxed max-w-4xl mx-auto px-4 ${className}`}
    >
      <p>
        Sentinel Ledger is an informational tool. It does not provide financial, investment, legal, or tax advice. All
        information is based on algorithmic analysis and may be incomplete. You are solely responsible for your
        investment decisions. Trading cryptocurrencies involves significant risk.
      </p>
    </div>
  );
}
