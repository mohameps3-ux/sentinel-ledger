/* Must stay in _app: global Tailwind + design tokens (Next.js only allows global CSS import from here). */
import "../styles/globals.css";
import { useEffect, useMemo } from "react";
import Head from "next/head";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import Link from "next/link";
import { AppErrorBoundary } from "../components/layout/AppErrorBoundary";
import { Navbar } from "../components/layout/Navbar";
import { MetaMaskSolanaInit } from "../components/wallet/MetaMaskSolanaInit";
import { createSolanaWalletAdapters } from "../lib/solanaWalletAdapters";
import { getPublicSolanaRpcUrl } from "../lib/publicRuntime";
import "@solana/wallet-adapter-react-ui/styles.css";

const queryClient = new QueryClient();

export default function App({ Component, pageProps }) {
  const endpoint = useMemo(() => getPublicSolanaRpcUrl(), []);
  const wallets = useMemo(() => createSolanaWalletAdapters(), []);

  useEffect(() => {
    document.documentElement.dataset.sentinelClient = "1";
  }, []);

  return (
    <>
      <Head>
        {/* viewport: see pages/_document.js (single tag, avoids duplicates) */}
        <meta name="theme-color" content="#0B0E11" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>
    <ConnectionProvider endpoint={endpoint}>
      <MetaMaskSolanaInit rpcUrl={endpoint} />
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <QueryClientProvider client={queryClient}>
            <div className="min-h-screen bg-[#0B0E11] text-white" translate="no">
              <Navbar />
              <main className="pt-[88px] md:pt-24 pb-24 md:pb-14 w-full max-w-[100vw] overflow-x-clip min-w-0">
                <AppErrorBoundary>
                  <Component {...pageProps} />
                </AppErrorBoundary>
              </main>
              <footer className="border-t border-[#2a2f36] mt-16">
                <div className="sl-container sl-container-wide py-10 flex flex-wrap items-center justify-between gap-4 sl-body text-gray-500">
                  <span>Sentinel Ledger</span>
                  <div className="flex items-center gap-4">
                    <Link href="/terms" className="hover:text-gray-300 transition">Terms</Link>
                    <Link href="/privacy" className="hover:text-gray-300 transition">Privacy</Link>
                    <Link href="/compare" className="hover:text-gray-300 transition">Compare</Link>
                    <Link href="/ops" className="hover:text-gray-300 transition">Ops</Link>
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
    </>
  );
}

