import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";
import bs58 from "bs58";

export function WalletButton() {
  const { publicKey, signMessage, connected } = useWallet();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (connected && publicKey && !localStorage.getItem("token")) handleAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey]);

  const handleAuth = async () => {
    try {
      if (!publicKey || !signMessage) return;
      setLoading(true);
      const API_URL = process.env.NEXT_PUBLIC_API_URL;
      const wallet = publicKey.toBase58();

      const { message } = await fetch(`${API_URL}/api/v1/auth/nonce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet })
      }).then((r) => r.json());

      const encodedMessage = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(encodedMessage);
      const signature = bs58.encode(signatureBytes);

      const { token } = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet,
          publicKey: wallet,
          signature,
          message
        })
      }).then((r) => r.json());

      if (token) {
        localStorage.setItem("token", token);
        window.location.reload();
      }
    } catch (err) {
      console.error("Auth error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <WalletMultiButton className="!bg-purple-600 hover:!bg-purple-700 !rounded-xl !h-10 !text-sm" />
      {loading && (
        <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
      )}
    </div>
  );
}

