export default function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-3xl font-bold">Terms and Conditions</h1>
      <p className="text-gray-300">
        By using Sentinel Ledger, you agree to these terms.
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">No Financial Advice</h2>
        <p className="text-gray-300">
          Sentinel Ledger provides analytics and risk signals for informational
          purposes only. Content does not constitute investment, legal, tax, or
          financial advice.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">User Responsibility</h2>
        <p className="text-gray-300">
          You are solely responsible for your actions, wallet interactions, and
          trading decisions. Always perform your own due diligence.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Wallet Consent</h2>
        <p className="text-gray-300">
          By connecting your wallet and signing authentication messages, you
          explicitly consent to wallet-based account access in the app. Signing
          for login does not authorize token transfers.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Limitation of Liability</h2>
        <p className="text-gray-300">
          Sentinel Ledger is provided &quot;as is&quot; without warranties. We
          are not liable for losses, missed opportunities, or damages arising
          from use of the platform.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Changes</h2>
        <p className="text-gray-300">
          We may update these terms at any time. Continued use of the app means
          acceptance of updated terms.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Refunds</h2>
        <p className="text-gray-300">
          For subscription or one-time purchases processed through Stripe, you may request a full refund within 24
          hours of purchase. After 24 hours, refunds are not guaranteed. Contact support for exceptional cases. Nothing
          in this section limits your statutory consumer rights where applicable.
        </p>
      </section>
    </div>
  );
}

