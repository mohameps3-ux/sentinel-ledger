export default function ContactPage() {
  return (
    <div className="sl-container py-10">
      <section className="glass-card sl-inset max-w-3xl mx-auto space-y-4">
        <p className="sl-label">Contact</p>
        <h1 className="sl-h2 text-white">Contacto</h1>
        <p className="text-sm text-gray-300">
          For billing, account, or security issues, use the in-app support / ops channel.
        </p>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm">
          <p className="text-gray-400">Preferred support flow:</p>
          <ul className="mt-2 space-y-1 text-gray-200">
            <li>• Open <span className="mono">/ops</span> if you are an operator.</li>
            <li>• Use Telegram / Omni support entry if enabled.</li>
            <li>• Include wallet address, timestamp, and expected behavior.</li>
          </ul>
        </div>
      </section>
    </div>
  );
}
