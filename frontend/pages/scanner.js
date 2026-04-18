import { useState } from "react";
import { useRouter } from "next/router";
import { ProButton } from "../components/ui/ProButton";
import { PageHead } from "../components/seo/PageHead";

export default function ScannerPage() {
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  const onSubmit = (e) => {
    e.preventDefault();
    const v = address.trim();
    if (v.length < 32 || v.length > 64) {
      setError("Paste a valid Solana mint (32-64 chars).");
      return;
    }
    setError("");
    router.push(`/token/${v}`);
  };

  return (
    <>
      <PageHead
        title="Solana Token Scanner — Sentinel Ledger"
        description="Analyze any Solana token: cluster heat, smart money flow, and entry signal."
      />
    <div className="sl-container py-10">
      <section className="glass-card sl-inset max-w-3xl mx-auto">
        <p className="sl-label">Scanner</p>
        <h1 className="sl-h2 text-white mt-1">One-click token scan</h1>
        <p className="sl-body sl-muted mt-2">
          Paste any Solana mint. Sentinel opens a full Decision Engine breakdown with score, red flags, and live flow.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="So11111111111111111111111111111111111111112"
            className="sl-input h-12"
          />
          {error ? <p className="text-sm text-red-300">{error}</p> : null}
          <div className="flex flex-wrap gap-2">
            <ProButton type="submit">Scan token</ProButton>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => router.push("/")}
            >
              Back to dashboard
            </button>
          </div>
        </form>
      </section>
    </div>
    </>
  );
}
