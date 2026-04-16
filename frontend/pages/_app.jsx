import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { clusterApiUrl } from "@solana/web3.js";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import Link from "next/link";
import { Navbar } from "../components/layout/Navbar";
import "../styles/globals.css";
import "@solana/wallet-adapter-react-ui/styles.css";

const queryClient = new QueryClient();

export default function App({ Component, pageProps }) {
  const endpoint = useMemo(() => clusterApiUrl("mainnet-beta"), []);
  const wallets = useMemo(
    () => [new PhantomWalletAdapter(), new SolflareWalletAdapter()],
    []
  );
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <QueryClientProvider client={queryClient}>
            <div className="min-h-screen bg-[#0B0E11] text-white">
              <Navbar />
              <main className="pt-24">
                <Component {...pageProps} />
              </main>
              <footer className="border-t soft-divider mt-12">
                <div className="max-w-[1400px] mx-auto px-4 py-6 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
                  <span>Sentinel Ledger</span>
                  <div className="flex items-center gap-4">
                    <Link href="/terms" className="hover:text-gray-300 transition">Terms</Link>
                    <Link href="/privacy" className="hover:text-gray-300 transition">Privacy</Link>
                    <Link href="/compare" className="hover:text-gray-300 transition">Compare</Link>
                    <a href="https://x.com" target="_blank" rel="noreferrer" className="hover:text-gray-300 transition">Twitter</a>
                    <a href="https://github.com/mohameps3-ux/sentinel-ledger" target="_blank" rel="noreferrer" className="hover:text-gray-300 transition">GitHub</a>
                  </div>
                </div>
              </footer>
              <Toaster
                position="top-right"
                toastOptions={{
                  duration: 3000,
                  style: {
                    background: "#13171A",
                    color: "#F3F4F6",
                    border: "1px solid #2A2F36",
                    borderRadius: "14px"
                  }
                }}
              />
            </div>
          </QueryClientProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

