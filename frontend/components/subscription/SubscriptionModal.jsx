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
      className="fixed inset-0 z-[180] flex items-end sm:items-center justify-center p-3 sm:p-6 bg-black/70 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="subscription-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        className="w-full max-w-lg rounded border border-zinc-700/90 bg-[#0b0c0f] shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-3">
          <h2
            id="subscription-modal-title"
            className="font-mono text-sm font-semibold uppercase tracking-wide text-zinc-100 pr-2"
          >
            Acceso completo a Sentinel
          </h2>
          <button
            type="button"
            onClick={handleClose}
            className="font-mono text-zinc-500 hover:text-zinc-300 px-2 py-0.5 -mr-1 transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {phase === "verifying" ? (
            <p className="font-mono text-xs text-zinc-400">Verifying payment…</p>
          ) : null}

          {inlineError ? (
            <div
              className="font-mono text-xs text-zinc-300 border border-zinc-700 bg-zinc-900/60 rounded px-3 py-2"
              role="alert"
            >
              {inlineError}
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              disabled={anyBusy}
              onClick={() => pay(TRIAL_AMOUNT, "trial")}
              className="flex-1 w-full text-left rounded border border-zinc-700/90 bg-zinc-900/35
                         hover:border-zinc-500 hover:bg-zinc-800/40 transition-colors px-4 py-3
                         disabled:opacity-45 disabled:pointer-events-none"
            >
              <div className="font-mono text-xs font-semibold uppercase tracking-wide text-zinc-100">
                Probar 7 días
              </div>
              <div className="font-mono text-[10px] text-zinc-500 mt-1.5 leading-snug">
                10 USDC · red Solana
              </div>
              {busyCard === "trial" ? (
                <div className="font-mono text-[10px] text-zinc-400 mt-2">
                  {phase === "signing" ? "Firmando en Phantom…" : null}
                  {phase === "verifying" ? "Verificando pago…" : null}
                </div>
              ) : null}
            </button>

            <button
              type="button"
              disabled={anyBusy}
              onClick={() => pay(PRO_AMOUNT, "pro")}
              className="flex-1 w-full text-left rounded border border-zinc-700/90 bg-zinc-900/35
                         hover:border-zinc-500 hover:bg-zinc-800/40 transition-colors px-4 py-3
                         disabled:opacity-45 disabled:pointer-events-none"
            >
              <div className="font-mono text-xs font-semibold uppercase tracking-wide text-zinc-100">
                Acceso completo 30 días
              </div>
              <div className="font-mono text-[10px] text-zinc-500 mt-1.5 leading-snug">
                29 USDC · red Solana
              </div>
              {busyCard === "pro" ? (
                <div className="font-mono text-[10px] text-zinc-400 mt-2">
                  {phase === "signing" ? "Firmando en Phantom…" : null}
                  {phase === "verifying" ? "Verificando pago…" : null}
                </div>
              ) : null}
            </button>
          </div>

          <p className="font-mono text-[10px] text-zinc-600 leading-relaxed">
            Mainnet · USDC ({USDC_MINT.slice(0, 4)}…). Envío a tesorería Sentinel; la activación se confirma en el
            servidor tras la transacción.
          </p>
        </div>
      </div>
    </div>
  );
}
