import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddressSync
} from "@solana/spl-token";
import { useWallet } from "@solana/wallet-adapter-react";
import { getPublicApiUrl } from "../../lib/publicRuntime";

const TREASURY_WALLET = "14KHdS4ivHvGi7ZTPFCEWYwv56riQi4xhPsmq5ZcK26g";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const TRIAL_AMOUNT = 10_000_000;
const PRO_AMOUNT = 29_000_000;

const FALLBACK_MAINNET_RPC = "https://api.mainnet-beta.solana.com";
const SIGNING_TIMEOUT_MS = 90_000;

function getModalRpcUrl() {
  const raw = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_HELIUS_RPC_URL : "";
  const s = typeof raw === "string" ? raw.trim() : "";
  return s || FALLBACK_MAINNET_RPC;
}

function errorText(err) {
  if (err == null) return "";
  if (typeof err === "string") return err;
  const parts = [
    err.message,
    err.msg,
    err.error,
    typeof err.error === "string" ? err.error : err.error?.message,
    err.data?.message,
    err.data?.error
  ];
  return parts.filter(Boolean).join(" ");
}

function mapSendError(err) {
  const raw = errorText(err);
  const msg = raw.toLowerCase();
  const code = err?.code ?? err?.error?.code;
  if (code === 4001 || /user rejected|user reject|cancel|denied|rejected request|transaction cancelled/i.test(msg)) {
    return "Pago cancelado";
  }
  if (/blocked|bloqueada|request blocked|solicitud bloqueada|popup blocked|not allowed/i.test(msg)) {
    return "Solicitud bloqueada por Phantom";
  }
  if (/insufficient|custom program error: 0x1|insufficient funds/i.test(msg)) {
    return "Saldo USDC insuficiente";
  }
  if (/fetch failed|failed to fetch|network|econnreset|timeout|etimedout|socket/i.test(msg)) {
    return "Error de red, inténtalo de nuevo";
  }
  return null;
}

function withTimeout(promise, ms, timeoutError) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutError)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** @returns {Promise<string>} transaction signature */
async function phantomSignAndSend(connection, transaction) {
  const w = typeof window !== "undefined" ? window.solana : null;
  if (!w || typeof w.signAndSendTransaction !== "function") {
    throw new Error("phantom_sign_unavailable");
  }
  const out = await w.signAndSendTransaction(transaction, connection);
  if (typeof out === "string") return out;
  if (out && typeof out.signature === "string") return out.signature;
  throw new Error("no_signature");
}

export default function SubscriptionModal({ isOpen, onClose, onSuccess }) {
  const { publicKey } = useWallet();
  const [busyCard, setBusyCard] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [inlineError, setInlineError] = useState("");
  const flowIdRef = useRef(0);

  const rpcUrl = useMemo(() => getModalRpcUrl(), []);
  const connection = useMemo(() => new Connection(rpcUrl, "confirmed"), [rpcUrl]);

  const mintPk = useMemo(() => new PublicKey(USDC_MINT), []);
  const treasuryPk = useMemo(() => new PublicKey(TREASURY_WALLET), []);

  const resetFlow = useCallback(() => {
    setBusyCard(null);
    setPhase("idle");
  }, []);

  const handleClose = useCallback(() => {
    flowIdRef.current += 1;
    resetFlow();
    setInlineError("");
    onClose();
  }, [onClose, resetFlow]);

  useEffect(() => {
    if (!isOpen) return;
    flowIdRef.current += 1;
    resetFlow();
    setInlineError("");
  }, [isOpen, resetFlow]);

  const verifyPayment = useCallback(async (signature, walletAddress) => {
    const base = getPublicApiUrl().replace(/\/+$/, "");
    const path = "/api/v1/subscription/verify";
    const url = base ? `${base}${path}` : path;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      body: JSON.stringify({ signature, walletAddress })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.ok) {
      const backendErr = json?.error != null ? String(json.error) : `verify_${res.status}`;
      throw new Error(backendErr);
    }
    return json;
  }, []);

  const pay = useCallback(
    async (amount, cardKey) => {
      const flowId = flowIdRef.current + 1;
      flowIdRef.current = flowId;
      const isStale = () => flowIdRef.current !== flowId;

      setInlineError("");
      if (!publicKey) {
        setInlineError("Conecta tu billetera para continuar.");
        return;
      }
      setBusyCard(cardKey);
      setPhase("signing");
      try {
        const userAta = getAssociatedTokenAddressSync(mintPk, publicKey, false);
        const treasuryAta = getAssociatedTokenAddressSync(mintPk, treasuryPk, false);

        const userAtaInfo = await connection.getAccountInfo(userAta);
        if (isStale()) return;
        const treasuryAtaInfo = await connection.getAccountInfo(treasuryAta);
        if (isStale()) return;

        if (!userAtaInfo) {
          setInlineError("No tienes USDC en esta wallet");
          return;
        }

        const ixTransfer = createTransferInstruction(
          userAta,
          treasuryAta,
          publicKey,
          BigInt(amount),
          [],
          TOKEN_PROGRAM_ID
        );

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
        if (isStale()) return;
        const tx = new Transaction({ feePayer: publicKey, recentBlockhash: blockhash });
        if (!treasuryAtaInfo) {
          tx.add(
            createAssociatedTokenAccountIdempotentInstruction(
              publicKey,
              treasuryAta,
              treasuryPk,
              mintPk
            )
          );
        }
        tx.add(ixTransfer);

        const signature = await withTimeout(
          phantomSignAndSend(connection, tx),
          SIGNING_TIMEOUT_MS,
          "signing_timeout"
        );
        if (isStale()) return;

        await connection.confirmTransaction(
          { signature, blockhash, lastValidBlockHeight },
          "confirmed"
        );
        if (isStale()) return;

        setPhase("verifying");
        await verifyPayment(signature, publicKey.toBase58());
        if (isStale()) return;

        if (typeof onSuccess === "function") await onSuccess();
        handleClose();
      } catch (e) {
        if (isStale()) return;
        if (String(e?.message || e) === "signing_timeout") {
          setInlineError("La operación tardó demasiado, inténtalo de nuevo");
        } else {
          const mapped = mapSendError(e);
          if (mapped) {
            setInlineError(mapped);
          } else if (String(e?.message || e) === "phantom_sign_unavailable") {
            setInlineError("Phantom no está disponible. Usa Phantom para firmar el envío.");
          } else {
            setInlineError(errorText(e) || "Error desconocido");
          }
        }
      } finally {
        if (!isStale()) {
          resetFlow();
        }
      }
    },
    [connection, handleClose, mintPk, onSuccess, publicKey, resetFlow, treasuryPk, verifyPayment]
  );

  if (!isOpen) return null;

  const anyBusy = busyCard != null;

  return (
    <div
      className="fixed inset-0 z-[180] flex items-end justify-center bg-black/75 p-3 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscription-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="sl-card-premium sl-aurora relative w-full max-w-lg p-0"
        style={{ animation: "sl-modal-in 0.35s cubic-bezier(0.22, 1, 0.36, 1)" }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <style jsx>{`
          @keyframes sl-modal-in {
            from { opacity: 0; transform: translateY(12px) scale(0.97); }
            to   { opacity: 1; transform: translateY(0) scale(1); }
          }
        `}</style>

        <div className="relative z-10 flex items-start justify-between gap-3 border-b border-[var(--sl-border)] px-6 py-4">
          <div>
            <div className="sl-eyebrow flex items-center gap-2 text-[var(--sl-sapphire-hi)]">
              <span className="sl-live-dot" />
              Sentinel PRO
            </div>
            <h2 id="subscription-modal-title" className="sl-display mt-1.5 text-xl font-bold text-[var(--sl-text-primary)]">
              Unlock the full edge
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--sl-border)] text-[var(--sl-text-muted)] transition-colors hover:border-[var(--sl-sapphire-hi)] hover:text-[var(--sl-diamond)]"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="relative z-10 space-y-4 p-6">
          {phase === "verifying" ? (
            <p className="sl-num text-[12px] text-[var(--sl-sapphire-hi)]">
              <span className="inline-block animate-spin">◐</span> Verifying on-chain payment…
            </p>
          ) : null}

          {inlineError ? (
            <div className="sl-num rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-[12px] text-rose-200" role="alert">
              {inlineError}
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={anyBusy}
              onClick={() => pay(TRIAL_AMOUNT, "trial")}
              className="sl-card-premium sl-shine-edge group relative w-full p-5 text-left disabled:cursor-not-allowed disabled:opacity-50"
            >
              <div className="sl-eyebrow">Trial</div>
              <div className="sl-display mt-1 text-2xl font-bold text-[var(--sl-text-primary)]">7 days</div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="sl-num text-3xl font-bold text-[var(--sl-diamond)]">10</span>
                <span className="sl-num text-xs font-bold text-[var(--sl-text-muted)]">USDC</span>
              </div>
              <div className="mt-2 text-[11px] text-[var(--sl-text-muted)]">Solana mainnet · one-time</div>
              {busyCard === "trial" ? (
                <div className="sl-num mt-3 flex items-center gap-2 text-[11px] text-[var(--sl-sapphire-hi)]">
                  <span className="inline-block animate-spin">◐</span>
                  {phase === "signing" ? "Sign in Phantom…" : phase === "verifying" ? "Verifying…" : "…"}
                </div>
              ) : null}
            </button>

            <button
              type="button"
              disabled={anyBusy}
              onClick={() => pay(PRO_AMOUNT, "pro")}
              className="sl-card-premium sl-shine-edge group relative w-full p-5 text-left disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                borderColor: "rgba(var(--sl-sapphire-hi-rgb), 0.45)",
                boxShadow: "0 0 0 1px rgba(var(--sl-sapphire-hi-rgb), 0.25), 0 16px 36px -12px rgba(0,0,0,0.6), 0 0 28px -4px rgba(var(--sl-sapphire-rgb), 0.35)"
              }}
            >
              <div className="absolute right-3 top-3 sl-pill" style={{ padding: "2px 8px", fontSize: "9px" }}>
                Best value
              </div>
              <div className="sl-eyebrow text-[var(--sl-sapphire-hi)]">Pro</div>
              <div className="sl-display mt-1 text-2xl font-bold text-[var(--sl-text-primary)]">30 days</div>
              <div className="mt-3 flex items-baseline gap-1.5">
                <span className="sl-num text-3xl font-bold text-[var(--sl-diamond-bright)] drop-shadow-[0_0_12px_rgba(96,165,250,0.45)]">29</span>
                <span className="sl-num text-xs font-bold text-[var(--sl-text-muted)]">USDC</span>
              </div>
              <div className="mt-2 text-[11px] text-[var(--sl-text-muted)]">Solana mainnet · one-time</div>
              {busyCard === "pro" ? (
                <div className="sl-num mt-3 flex items-center gap-2 text-[11px] text-[var(--sl-sapphire-hi)]">
                  <span className="inline-block animate-spin">◐</span>
                  {phase === "signing" ? "Sign in Phantom…" : phase === "verifying" ? "Verifying…" : "…"}
                </div>
              ) : null}
            </button>
          </div>

          <ul className="grid gap-2 rounded-lg border border-[var(--sl-border)] bg-[var(--sl-bg-base)]/40 p-3.5 text-[12px] text-[var(--sl-text-secondary)]">
            <li className="flex items-center gap-2">
              <span className="sl-live-dot sl-live-dot--win" />
              Real-time signal feed (no 30-minute delay)
            </li>
            <li className="flex items-center gap-2">
              <span className="sl-live-dot sl-live-dot--win" />
              Smart Money per-token panels + alerts
            </li>
            <li className="flex items-center gap-2">
              <span className="sl-live-dot sl-live-dot--win" />
              Wallet Stalker · unlimited
            </li>
          </ul>

          <p className="sl-num text-[10.5px] leading-relaxed text-[var(--sl-text-muted)]">
            Solana mainnet · USDC ({USDC_MINT.slice(0, 4)}…). Direct transfer to the Sentinel treasury; activation is
            confirmed server-side after the transaction.
          </p>
        </div>
      </div>
    </div>
  );
}
