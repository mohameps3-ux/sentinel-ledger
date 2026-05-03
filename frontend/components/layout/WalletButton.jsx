import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletMultiButton } from "@solana/wallet-adapter-base-ui";
import { WalletMultiButton, useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useEffect, useRef, useState } from "react";
import bs58 from "bs58";
import { ChevronDown, LogOut, ShieldCheck, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { getPublicApiUrl } from "../../lib/publicRuntime";

const walletMultiButtonClass =
  "!bg-sl-violet hover:!opacity-95 !rounded-[2px] !h-7 !min-h-0 !text-[9px] !min-w-0 !max-w-[5.25rem] !justify-center !truncate !px-1.5 !py-0 !leading-tight !font-semibold";
const navWalletClass =
  "!btn-ghost-sm !h-7 !min-h-0 !rounded-[2px] !border !border-sl-border !bg-transparent hover:!border-sl-hover !px-2 !py-0 !font-mono !text-2xs !font-medium !uppercase !tracking-[0.08em] !text-sl-muted hover:!text-sl-sub !shadow-none";

const CONNECTING_STUCK_MS = 40000;

export function WalletButton({ navCompact = false }) {
  const { publicKey, signMessage, connected, connecting, disconnect } = useWallet();
  const { setVisible } = useWalletModal();
  const { buttonState, onConnect } = useWalletMultiButton({
    onSelectWallet: () => setVisible(true)
  });
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const authInFlightRef = useRef(false);
  const wrapRef = useRef(null);
  /** WalletMultiButton SSR output ≠ client (wallets / extensions); render only after mount. */
  const [walletUiReady, setWalletUiReady] = useState(false);

  useEffect(() => {
    setWalletUiReady(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  /** autoConnect / extension hang leaves `connecting` true forever — clear so UI is usable again */
  useEffect(() => {
    if (!connecting || connected) return undefined;
    const id = window.setTimeout(() => {
      disconnect().catch(() => {});
      toast.error("Conexión cancelada: tardó demasiado. Elige cartera de nuevo.");
    }, CONNECTING_STUCK_MS);
    return () => window.clearTimeout(id);
  }, [connecting, connected, disconnect]);

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

  const handleConnectFromMenu = () => {
    if (connecting || buttonState === "connecting") {
      setOpen(false);
      setVisible(true);
      return;
    }
    setOpen(false);
    if (buttonState === "no-wallet") setVisible(true);
    else if (buttonState === "has-wallet" && onConnect) onConnect();
  };

  const showConnectingLabel = connecting || buttonState === "connecting";

  const menuItemClass =
    "w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-mono text-sl-sub transition hover:bg-white/5";

  return (
    <div ref={wrapRef} className="relative z-[200] flex items-center justify-end gap-1 min-w-0 shrink-0">
      {navCompact && walletUiReady ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={`${navWalletClass} !inline-flex !max-w-[14rem] !min-w-0 !items-center !gap-1.5`}
            aria-expanded={open}
            aria-haspopup="menu"
            title={connected ? shortWallet : "Wallet"}
          >
            {connected ? (
              <>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center border border-sl-border bg-sl-card text-emerald-400/90">
                  <ShieldCheck size={15} strokeWidth={2} aria-hidden />
                </span>
                <span className="min-w-0 truncate normal-case tracking-normal">{shortWallet}</span>
              </>
            ) : (
              <>
                <Wallet size={14} className="shrink-0 text-sl-sub opacity-85" aria-hidden />
                <span>Wallet</span>
              </>
            )}
            <ChevronDown
              size={12}
              className={`ml-0.5 shrink-0 opacity-70 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>

          {open ? (
            <div
              role="menu"
              className="absolute right-0 top-[calc(100%+6px)] z-[500] min-w-[11rem] rounded-[2px] border border-sl-border bg-sl-card py-1 shadow-2xl"
            >
              {connected ? (
                <button type="button" role="menuitem" onClick={handleLogout} className={menuItemClass}>
                  <LogOut size={14} className="shrink-0 opacity-80" aria-hidden />
                  Desconectar
                </button>
              ) : (
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleConnectFromMenu}
                  className={menuItemClass}
                  title={
                    showConnectingLabel
                      ? "Abre el listado de carteras si la conexión no termina"
                      : undefined
                  }
                >
                  <Wallet size={14} className="shrink-0 opacity-80" aria-hidden />
                  {showConnectingLabel ? "Elegir cartera" : "Conectar"}
                </button>
              )}
            </div>
          ) : null}
        </>
      ) : walletUiReady ? (
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

      {!navCompact ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`hidden sm:inline-flex items-center gap-0.5 h-7 pl-1 pr-1 rounded-md border text-[9px] transition max-w-[4.75rem] sm:max-w-[5.5rem] truncate ${
            connected
              ? "bg-[#0B0F14] soft-divider text-[#60A5FA] hover:bg-[#1E3A5F] hover:border-[#2563EB] hover:text-[#60A5FA]"
              : "bg-[#0B0F14] soft-divider text-[#E6EDF3] hover:bg-[#1E3A5F] hover:border-[#2563EB] hover:text-[#60A5FA]"
          }`}
          aria-expanded={open}
          aria-haspopup="true"
          title="Cuenta y desconectar"
        >
          <ShieldCheck size={11} className="shrink-0" />
          <span className="truncate min-w-0">{shortWallet}</span>
          <ChevronDown size={11} className={`shrink-0 transition ${open ? "rotate-180" : ""}`} />
        </button>
      ) : null}

      {open && !navCompact && connected ? (
        <div className="absolute right-0 top-[calc(100%+4px)] z-[500] w-40 rounded-[2px] border border-sl-border bg-sl-card p-1 shadow-2xl">
          <button
            type="button"
            onClick={handleLogout}
            className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs text-sl-sub hover:bg-white/5 transition"
          >
            <LogOut size={13} />
            Disconnect
          </button>
        </div>
      ) : null}

      {loading && (
        <div className="w-4 h-4 border-2 border-[#2563EB] border-t-transparent rounded-full animate-spin ml-1" />
      )}
    </div>
  );
}
