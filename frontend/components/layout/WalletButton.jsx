import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useRef, useState } from "react";
import bs58 from "bs58";
import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { getPublicApiUrl } from "../../lib/publicRuntime";

const walletMultiButtonClass =
  "!bg-gradient-to-r !from-[#6c5ce7] !to-[#00cec9] hover:!opacity-95 !rounded-lg !h-8 !text-[10px] sm:!text-[11px] !min-w-0 !max-w-full !justify-center !truncate !px-2 !leading-tight !font-semibold";

export function WalletButton() {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const authInFlightRef = useRef(false);
  /** WalletMultiButton SSR output ≠ client (wallets / extensions); render only after mount. */
  const [walletUiReady, setWalletUiReady] = useState(false);

  useEffect(() => {
    setWalletUiReady(true);
  }, []);

  useEffect(() => {
    if (!connected || !publicKey) return;
    if (authInFlightRef.current) return;
    if (localStorage.getItem("token")) return;
    handleAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey]);

  const handleAuth = async () => {
    try {
      if (!publicKey || !signMessage) return;
      if (authInFlightRef.current) return;
      authInFlightRef.current = true;
      setLoading(true);
      const API_URL = getPublicApiUrl();
      const wallet = publicKey.toBase58();
      const consent = window.confirm(
        "By signing you accept our Terms, Privacy Policy, and Financial Disclaimer. Sentinel Ledger does not provide financial advice."
      );
      if (!consent) {
        toast("Signature cancelled.");
        try {
          await disconnect();
        } catch (_) {}
        return;
      }

      const nonceRes = await fetch(`${API_URL}/api/v1/auth/nonce`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: wallet })
      });
      const nonceJson = await nonceRes.json().catch(() => null);
      if (!nonceRes.ok || !nonceJson?.message) {
        throw new Error(nonceJson?.error || "nonce_failed");
      }
      const { message } = nonceJson;

      const encodedMessage = new TextEncoder().encode(message);
      const signatureBytes = await signMessage(encodedMessage);
      const signature = bs58.encode(signatureBytes);

      const loginRes = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress: wallet,
          publicKey: wallet,
          signature,
          message
        })
      });
      const loginJson = await loginRes.json().catch(() => null);
      if (!loginRes.ok || !loginJson?.token) {
        const code = loginJson?.error || "login_failed";
        if (code === "server_misconfigured") {
          toast.error("API is misconfigured (JWT_SECRET or Supabase keys missing on the server).");
        } else if (code === "nonce_not_found_or_expired" || code === "nonce_expired") {
          toast.error("Login session expired. Disconnect and try again.");
        } else if (code === "invalid_message") {
          toast.error("Login message mismatch. Try again.");
        } else {
          toast.error(`Authentication failed (${code}).`);
        }
        try {
          await disconnect();
        } catch (_) {}
        return;
      }
      const { token } = loginJson;

      if (token) {
        localStorage.setItem("token", token);
        toast.success("Wallet authenticated.");
        window.location.reload();
      }
    } catch (err) {
      console.error("Auth error:", err);
      toast.error("Wallet authentication failed.");
      try {
        await disconnect();
      } catch (_) {}
    } finally {
      setLoading(false);
      authInFlightRef.current = false;
    }
  };

  const shortWallet = publicKey?.toBase58()
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : "Disconnected";

  const handleLogout = async () => {
    localStorage.removeItem("token");
    setOpen(false);
    try {
      await disconnect();
    } catch (_) {}
    toast.success("Wallet disconnected.");
  };

  return (
    <div className="relative z-[70] flex items-center justify-end gap-1 min-w-0 w-auto max-w-[min(8.25rem,36vw)] sm:max-w-[9.25rem] md:max-w-[10rem] shrink-0">
      {walletUiReady ? (
        <WalletMultiButton className={walletMultiButtonClass} />
      ) : (
        <button
          type="button"
          disabled
          aria-label="Wallet"
          className={`wallet-adapter-button wallet-adapter-button-trigger ${walletMultiButtonClass}`}
        >
          Select Wallet
        </button>
      )}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`hidden lg:flex items-center gap-1.5 h-8 px-2 rounded-lg border text-[10px] transition max-w-[7.5rem] truncate ${
          connected
            ? "bg-[#13171A] border-emerald-600/30 text-emerald-300"
            : "bg-[#13171A] soft-divider text-gray-400"
        }`}
      >
        <ShieldCheck size={12} className="shrink-0" />
        <span className="truncate">{shortWallet}</span>
        <ChevronDown size={12} className={`shrink-0 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && connected && (
        <div className="absolute right-0 top-10 z-[200] w-44 rounded-lg border soft-divider bg-[#13171A] p-1.5 shadow-xl">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-200 hover:bg-white/5 transition"
          >
            <LogOut size={14} />
            Disconnect
          </button>
        </div>
      )}

      {loading && (
        <div className="w-4 h-4 border-2 border-purple-500 border-t-transparent rounded-full animate-spin ml-1" />
      )}
    </div>
  );
}

