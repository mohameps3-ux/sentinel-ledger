import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { useEffect, useState } from "react";
import bs58 from "bs58";
import { ChevronDown, LogOut, ShieldCheck } from "lucide-react";
import toast from "react-hot-toast";
import { getPublicApiUrl } from "../../lib/publicRuntime";

const walletMultiButtonClass =
  "!bg-gradient-to-r !from-[#6c5ce7] !to-[#00cec9] hover:!opacity-95 !rounded-[10px] !h-10 !text-[11px] sm:!text-sm !min-w-0 !max-w-full !justify-center !truncate !px-2";

export function WalletButton() {
  const { publicKey, signMessage, connected, disconnect } = useWallet();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  /** WalletMultiButton SSR output ≠ client (wallets / extensions); render only after mount. */
  const [walletUiReady, setWalletUiReady] = useState(false);

  useEffect(() => {
    setWalletUiReady(true);
  }, []);

  useEffect(() => {
    if (connected && publicKey && !localStorage.getItem("token")) handleAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, publicKey]);

  const handleAuth = async () => {
    try {
      if (!publicKey || !signMessage) return;
      setLoading(true);
      const API_URL = getPublicApiUrl();
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
        toast.success("Wallet authenticated.");
        window.location.reload();
      }
    } catch (err) {
      console.error("Auth error:", err);
      toast.error("Wallet authentication failed.");
    } finally {
      setLoading(false);
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
    <div className="relative z-[110] flex items-center justify-end gap-1.5 sm:gap-2 min-w-0 w-auto max-w-[min(10rem,38vw)] sm:max-w-[12rem] md:max-w-[11.5rem] lg:max-w-[13rem] shrink-0 md:shrink">
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
        className={`hidden md:flex items-center gap-2 h-10 px-3 rounded-xl border text-xs transition ${
          connected
            ? "bg-[#13171A] border-emerald-600/30 text-emerald-300"
            : "bg-[#13171A] soft-divider text-gray-400"
        }`}
      >
        <ShieldCheck size={14} />
        {shortWallet}
        <ChevronDown size={14} className={`transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && connected && (
        <div className="absolute right-0 top-12 z-[200] w-48 rounded-xl border soft-divider bg-[#13171A] p-2 shadow-xl">
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

