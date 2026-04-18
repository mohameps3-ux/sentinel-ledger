/* Must stay in _app: global Tailwind + design tokens (Next.js only allows global CSS import from here). */
import "../styles/globals.css";
import { Inter } from "next/font/google";
import { useEffect, useMemo } from "react";
import Head from "next/head";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "react-hot-toast";
import Link from "next/link";
import { AppErrorBoundary } from "../components/layout/AppErrorBoundary";
import { Navbar } from "../components/layout/Navbar";
import { FinancialDisclaimer } from "../components/layout/FinancialDisclaimer";
import { MetaMaskSolanaInit } from "../components/wallet/MetaMaskSolanaInit";
import { createSolanaWalletAdapters } from "../lib/solanaWalletAdapters";
import { getPublicSolanaRpcUrl } from "../lib/publicRuntime";
import "@solana/wallet-adapter-react-ui/styles.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"]
});

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
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>
    <ConnectionProvider endpoint={endpoint}>
      <MetaMaskSolanaInit rpcUrl={endpoint} />
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <QueryClientProvider client={queryClient}>
            <div
              className={`${inter.className} min-h-screen bg-[#0B0E11] text-white antialiased`}
              translate="no"
            >
              <Navbar />
              <main className="pt-[88px] md:pt-24 pb-24 md:pb-14 safe-bottom-pad w-full max-w-[100vw] overflow-x-clip min-w-0">
                <AppErrorBoundary>
                  <Component {...pageProps} />
                </AppErrorBoundary>
              </main>
              <footer className="border-t border-[#2a2f36] mt-16 safe-bottom-pad">
                <div className="sl-container sl-container-wide py-10 flex flex-wrap items-center justify-between gap-4 sl-body text-gray-500">
                  <span>Sentinel Ledger</span>
                  <div className="flex items-center gap-4">
                    <Link href="/terms" className="hover:text-gray-300 transition">Terms</Link>
                    <Link href="/privacy" className="hover:text-gray-300 transition">Privacy</Link>
                    <Link href="/legal" className="hover:text-gray-300 transition">Legal Notice</Link>
                    <Link href="/contact" className="hover:text-gray-300 transition">Contact</Link>
                    <Link href="/compare" className="hover:text-gray-300 transition">Compare</Link>
                    <Link href="/smart-money" className="hover:text-gray-300 transition">Smart Money</Link>
                    <Link href="/watchlist" className="hover:text-gray-300 transition">Watchlist</Link>
                    <Link href="/portfolio" className="hover:text-gray-300 transition">Portfolio</Link>
                    <Link href="/alerts" className="hover:text-gray-300 transition">Alerts</Link>
                    <Link href="/pricing" className="hover:text-gray-300 transition">Pricing</Link>
                    <Link href="/ops" className="hover:text-gray-300 transition">Ops</Link>
                    <a href="https://x.com" target="_blank" rel="noreferrer" className="hover:text-gray-300 transition">Twitter</a>
                    <a href="https://github.com/mohameps3-ux/sentinel-ledger" target="_blank" rel="noreferrer" className="hover:text-gray-300 transition">GitHub</a>
                  </div>
                </div>
                <div className="border-t border-gray-800/80 py-6">
                  <FinancialDisclaimer />
                </div>
              </footer>
              <Toaster
                position="bottom-center"
                containerStyle={{
                  bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))"
                }}
                toastOptions={{
                  duration: 3000,
                  style: {
                    background: "#13171A",
                    color: "#F3F4F6",
                    border: "1px solid #2A2F36",
                    borderRadius: "14px",
                    maxWidth: "min(100vw - 2rem, 24rem)"
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

