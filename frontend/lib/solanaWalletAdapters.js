import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { CoinbaseWalletAdapter } from "@solana/wallet-adapter-coinbase";
import { TrustWalletAdapter } from "@solana/wallet-adapter-trust";
import { BitgetWalletAdapter } from "@solana/wallet-adapter-bitkeep";
import { TokenPocketWalletAdapter } from "@solana/wallet-adapter-tokenpocket";
import { SafePalWalletAdapter } from "@solana/wallet-adapter-safepal";
import { WalletConnectWalletAdapter } from "@solana/wallet-adapter-walletconnect";

/**
 * Curated list (no @solana/wallet-adapter-wallets bundle — avoids heavy / fragile deps).
 * MetaMask Solana is registered separately via @metamask/connect-solana (Wallet Standard).
 * WalletConnect: set NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID (WalletConnect Cloud).
 */
export function createSolanaWalletAdapters() {
  const adapters = [
    new PhantomWalletAdapter(),
    new SolflareWalletAdapter(),
    new CoinbaseWalletAdapter(),
    new TrustWalletAdapter(),
    new BitgetWalletAdapter(),
    new TokenPocketWalletAdapter(),
    new SafePalWalletAdapter()
  ];

  const wc = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;
  const projectId = typeof wc === "string" ? wc.trim() : "";
  if (projectId) {
    const site =
      (typeof process.env.NEXT_PUBLIC_SITE_URL === "string" &&
        process.env.NEXT_PUBLIC_SITE_URL.trim()) ||
      "https://sentinel-ledger-ochre.vercel.app";
    const base = site.replace(/\/$/, "");
    adapters.push(
      new WalletConnectWalletAdapter({
        network: WalletAdapterNetwork.Mainnet,
        options: {
          projectId,
          relayUrl: "wss://relay.walletconnect.com",
          metadata: {
            name: "Sentinel Ledger",
            description: "Real-time on-chain intelligence for Solana",
            url: base,
            icons: [`${base}/favicon.ico`, `${base}/favicon.svg`]
          }
        }
      })
    );
  }

  return adapters;
}
