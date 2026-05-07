/**
 * CryptoPayButton.jsx
 *
 * Renders a "Pay 19 USDC" button that uses @solana/web3.js + @solana/spl-token
 * to send a USDC SPL transfer from the connected Phantom wallet to the owner
 * wallet on Solana mainnet.
 *
 * Required env var (set in frontend/.env.local or Vercel):
 *   NEXT_PUBLIC_OWNER_WALLET_ADDRESS — Solana address that receives USDC
 *   NEXT_PUBLIC_SOLANA_RPC_URL       — (optional) custom RPC, defaults to mainnet-beta
 */

import { useState, useCallback } from "react";
import { Connection, PublicKey, Transaction } from "@solana/web3.js";
import {
    getAssociatedTokenAddress,
    createAssociatedTokenAccountInstruction,
    createTransferInstruction,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

// ── Constants ────────────────────────────────────────────────────────────────
const USDC_MINT_ADDRESS = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDC_DECIMALS = 6;
const PRO_PRICE_USDC = 19;
const PRO_PRICE_ATOMS = PRO_PRICE_USDC * Math.pow(10, USDC_DECIMALS); // 19_000_000

const RPC_URL =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ||
    "https://api.mainnet-beta.solana.com";

const OWNER_WALLET =
    process.env.NEXT_PUBLIC_OWNER_WALLET_ADDRESS || "";

// ── Component ────────────────────────────────────────────────────────────────
export default function CryptoPayButton({ onSuccess, className = "" }) {
    const [status, setStatus] = useState("idle"); // idle | connecting | sending | confirming | success | error
  const [txSig, setTxSig] = useState(null);
    const [errorMsg, setErrorMsg] = useState(null);

  const handlePay = useCallback(async () => {
        setErrorMsg(null);
        setTxSig(null);

                                    if (!OWNER_WALLET) {
                                            setErrorMsg("Payment destination not configured. Contact support.");
                                            setStatus("error");
                                            return;
                                    }

                                    // ── 1. Get Phantom provider ────────────────────────────────────────────
                                    const provider = window?.solana;
        if (!provider?.isPhantom) {
                setErrorMsg("Phantom wallet not found. Please install the Phantom extension.");
                setStatus("error");
                return;
        }

                                    try {
                                            setStatus("connecting");
                                            await provider.connect();
                                            const senderPublicKey = provider.publicKey;
                                            if (!senderPublicKey) throw new Error("Could not retrieve public key from Phantom.");

          const connection = new Connection(RPC_URL, "confirmed");
                                            const usdcMint = new PublicKey(USDC_MINT_ADDRESS);
                                            const ownerPubkey = new PublicKey(OWNER_WALLET);

          // ── 2. Get/create associated token accounts ────────────────────────
          const senderATA = await getAssociatedTokenAddress(
                    usdcMint,
                    senderPublicKey,
                    false,
                    TOKEN_PROGRAM_ID,
                    ASSOCIATED_TOKEN_PROGRAM_ID
                  );

          const receiverATA = await getAssociatedTokenAddress(
                    usdcMint,
                    ownerPubkey,
                    false,
                    TOKEN_PROGRAM_ID,
                    ASSOCIATED_TOKEN_PROGRAM_ID
                  );

          // ── 3. Build transaction ───────────────────────────────────────────
          setStatus("sending");
                                            const transaction = new Transaction();

          // Create receiver ATA if it doesn't exist
          const receiverATAInfo = await connection.getAccountInfo(receiverATA);
                                            if (!receiverATAInfo) {
                                                      transaction.add(
                                                                  createAssociatedTokenAccountInstruction(
                                                                                senderPublicKey,
                                                                                receiverATA,
                                                                                ownerPubkey,
                                                                                usdcMint,
                                                                                TOKEN_PROGRAM_ID,
                                                                                ASSOCIATED_TOKEN_PROGRAM_ID
                                                                              )
                                                                );
                                            }

          // Add transfer instruction for exactly 19 USDC
          transaction.add(
                    createTransferInstruction(
                                senderATA,
                                receiverATA,
                                senderPublicKey,
                                PRO_PRICE_ATOMS,
                                [],
                                TOKEN_PROGRAM_ID
                              )
                  );

          // Set blockhash + fee payer
          const { blockhash, lastValidBlockHeight } =
                    await connection.getLatestBlockhash("confirmed");
                                            transaction.recentBlockhash = blockhash;
                                            transaction.feePayer = senderPublicKey;

          // ── 4. Sign via Phantom ────────────────────────────────────────────
          const signed = await provider.signTransaction(transaction);

          // ── 5. Send & confirm ─────────────────────────────────────────────
          setStatus("confirming");
                                            const signature = await connection.sendRawTransaction(signed.serialize());

          await connection.confirmTransaction(
            { signature, blockhash, lastValidBlockHeight },
                    "confirmed"
                  );

          setTxSig(signature);
                                            setStatus("success");
                                            if (onSuccess) onSuccess(signature);
                                    } catch (err) {
                                            console.error("[CryptoPayButton] payment error:", err);
                                            const msg =
                                                      err?.message?.includes("User rejected")
                                                ? "Transaction cancelled by user."
                                                        : err?.message || "Transaction failed. Please try again.";
                                            setErrorMsg(msg);
                                            setStatus("error");
                                    }
  }, [onSuccess]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (status === "success") {
        return (
                <div className={`flex flex-col items-center gap-2 ${className}`}>
                          <div className="text-green-400 font-semibold text-sm">
                                    ✅ Payment confirmed — PRO activated!
                          </div></div>
                  {txSig && (
                            <a
                                          href={`https://solscan.io/tx/${txSig}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-blue-400 underline hover:text-blue-300 break-all"
                                        >
                                        View on Solscan
                            </a></a>
                        )}
                </div></div>
              );
  }
  
    const isLoading = ["connecting", "sending", "confirming"].includes(status);
  
    const buttonLabel = {
          idle: "Pay 19 USDC",
          connecting: "Connecting…",
          sending: "Sending…",
          confirming: "Confirming…",
          error: "Retry Payment",
    }[status] || "Pay 19 USDC";
  
    return (
          <div className={`flex flex-col items-center gap-2 ${className}`}>
                <button
                          onClick={handlePay}
                          disabled={isLoading}
                          className={[
                                      "inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold text-sm transition-all",
                                      isLoading
                                        ? "bg-blue-700 text-blue-200 cursor-not-allowed opacity-70"
                                        : "bg-blue-600 hover:bg-blue-500 text-white cursor-pointer",
                                    ].join(" ")}
                        >
                  {isLoading && (
                                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                  )}
                  {buttonLabel}
                </button></button>
          
            {status === "error" && errorMsg && (
                    <p className="text-red-400 text-xs text-center max-w-xs">{errorMsg}</p></p>
                )}
          
                <p className="text-gray-500 text-xs">
                        Solana mainnet · USDC · Phantom required
                </p></p>
          </div></div>
        );
}</div>
