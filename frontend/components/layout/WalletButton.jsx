import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletMultiButton } from "@solana/wallet-adapter-base-ui";
import { WalletMultiButton, useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useEffect, useRef, useState } from "react";
import bs58 from "bs58";
import { ChevronDown, LogOut, ShieldCheck, Wallet } from "lucide-react";
import toast from "react-hot-toast";
import { getPublicApiUrl } from "../../lib/publicRuntime";

const walletMultiButtonClass =
  "!bg-gradient-to-br !from-[rgba(37,99,235,0.95)] !to-[rgba(29,78,216,0.95)] hover:!from-[rgba(59,130,246,1)] hover:!to-[rgba(37,99,235,1)] !rounded-lg !h-8 !min-h-0 !text-[10px] !min-w-0 !max-w-[6rem] !justify-center !truncate !px-2.5 !py-0 !leading-tight !font-bold !tracking-[0.1em] !uppercase !shadow-[0_0_0_1px_rgba(96,165,250,0.4)_inset,0_8px_22px_-8px_rgba(37,99,235,0.7)] hover:!shadow-[0_0_0_1px_rgba(147,197,253,0.55)_inset,0_12px_30px_-8px_rgba(37,99,235,0.85)] !transition-all";
const navWalletClass =
  "!inline-flex !h-8 !min-h-0 !rounded-lg !border !border-[var(--sl-border)] !bg-[var(--sl-bg-surface)] hover:!border-[rgba(96,165,250,0.55)] hover:!bg-[rgba(37,99,235,0.08)] !px-2.5 !py-0 !font-mono !text-[10.5px] !font-bold !uppercase !tracking-[0.12em] !text-[var(--sl-text-secondary)] hover:!text-[var(--sl-diamond)] !transition-all sl-shine-edge";

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
    "w-full flex items-center gap-2 px-3 py-2 text-left text-[11px] font-mono font-semibold uppercase tracking-[0.08em] text-[var(--sl-text-secondary)] transition-colors hover:bg-[rgba(37,99,235,0.10)] hover:text-[var(--sl-diamond)]";

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
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md border border-[rgba(96,165,250,0.55)] bg-[rgba(37,99,235,0.18)] text-[var(--sl-diamond)] shadow-[0_0_10px_rgba(37,99,235,0.35)]">
                  <ShieldCheck size={11} strokeWidth={2.4} aria-hidden />
                </span>
                <span className="sl-num min-w-0 truncate text-[10.5px] font-bold normal-case tracking-normal text-[var(--sl-text-primary)]">
                  {shortWallet}
                </span>
              </>
            ) : (
              <>
                <Wallet size={13} className="shrink-0 text-[var(--sl-sapphire-hi)]" aria-hidden />
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
              className="sl-card-premium absolute right-0 top-[calc(100%+8px)] z-[500] min-w-[12rem] overflow-hidden py-1.5"
              style={{ animation: "sl-dropdown-in 0.18s cubic-bezier(0.22, 1, 0.36, 1)" }}
            >
              <style jsx>{`
                @keyframes sl-dropdown-in {
                  from { opacity: 0; transform: translateY(-4px); }
                  to   { opacity: 1; transform: translateY(0); }
                }
              `}</style>
              {connected ? (
                <div className="px-3 py-2 border-b border-[var(--sl-border)] mb-1">
                  <div className="sl-eyebrow text-[var(--sl-sapphire-hi)]">Connected</div>
                  <div className="sl-num mt-0.5 text-[11px] font-bold text-[var(--sl-text-primary)]">{shortWallet}</div>
                </div>
              ) : null}
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
        <div className="ml-1 h-4 w-4 animate-spin rounded-full border-2 border-[var(--sl-sapphire-hi)] border-t-transparent shadow-[0_0_10px_rgba(96,165,250,0.45)]" />
      )}
    </div>
  );
}
