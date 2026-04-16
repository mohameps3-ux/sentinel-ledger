import { useEffect } from "react";
import { createSolanaClient } from "@metamask/connect-solana";

/**
 * Registers MetaMask (Solana snap / Wallet Standard) so it appears in the wallet modal.
 * Safe no-op if extension not installed.
 */
export function MetaMaskSolanaInit({ rpcUrl }) {
  useEffect(() => {
    if (typeof window === "undefined" || !rpcUrl) return;

    let cancelled = false;
    (async () => {
      try {
        await createSolanaClient({
          dapp: {
            name: "Sentinel Ledger",
            url: window.location.origin
          },
          api: {
            supportedNetworks: {
              mainnet: rpcUrl
            }
          }
        });
      } catch (e) {
        if (!cancelled) console.warn("MetaMask Solana init:", e?.message || e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rpcUrl]);

  return null;
}
