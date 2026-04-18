export default function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <h1 className="text-3xl font-bold">Privacy Policy</h1>
      <p className="text-gray-300">
        This policy explains what data Sentinel Ledger processes and why.
      </p>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Data We Process</h2>
        <ul className="list-disc pl-5 text-gray-300 space-y-1">
          <li>Public wallet address for authentication and account linking.</li>
          <li>Optional Telegram identifiers (ID and username) if provided.</li>
          <li>Email address if you provide it during checkout or account flows (processed by our payment provider).</li>
          <li>App usage data required for watchlists, notes, and alerts.</li>
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Payments (Stripe)</h2>
        <p className="text-gray-300">
          Payments are processed by Stripe. We do not store full card numbers on our servers. Stripe may process billing
          details, tax location, and transaction records according to its own privacy policy. Enabling Stripe Tax is
          configured in the Stripe Dashboard.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Data We Do Not Process</h2>
        <p className="text-gray-300">
          We never request or store private keys, seed phrases, or wallet
          secrets.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Purpose and Legal Basis</h2>
        <p className="text-gray-300">
          Data is used to operate the service, authenticate users, and provide
          requested features. Processing is based on legitimate interest and
          user consent where required.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Your Rights (GDPR)</h2>
        <p className="text-gray-300">
          You may request access, correction, deletion, portability, or
          restriction of your personal data, and you may object to processing
          where applicable.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Retention and Security</h2>
        <p className="text-gray-300">
          We retain only data required to provide the service and apply
          reasonable technical and organizational safeguards.
        </p>
      </section>
    </div>
  );
}

