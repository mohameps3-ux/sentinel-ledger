/* Must stay in _app: global Tailwind + design tokens (Next.js only allows global CSS import from here). */
import "../styles/globals.css";
import "../styles/sentinel-design-system.css";
import "../styles/apex-obsidian.css";
import "../styles/home-compact-top.css";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import dynamic from "next/dynamic";
import { useEffect, useMemo } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WarModeProvider } from "../contexts/WarModeContext";
import { LocaleProvider } from "../contexts/LocaleContext";
import { SubscriptionModalProvider } from "../contexts/SubscriptionModalContext";
import { ScoreSocketProvider } from "@/components/providers/ScoreSocketProvider";
import { Toaster } from "react-hot-toast";
import { AppErrorBoundary } from "../components/layout/AppErrorBoundary";
import { Navbar } from "../components/layout/Navbar";
import { GlobalStatusBar } from "../components/layout/GlobalStatusBar";
import { GlobalWayfinding } from "../components/layout/GlobalWayfinding";
import { SiteFooter } from "../components/layout/SiteFooter";
import { GlobalCommandHud } from "../components/terminal/GlobalCommandHud";
import { MetaMaskSolanaInit } from "../components/wallet/MetaMaskSolanaInit";

const SentinelBot = dynamic(() => import("../components/bot/SentinelBot"), { ssr: false });
import { createSolanaWalletAdapters } from "../lib/solanaWalletAdapters";
import { getPublicSolanaRpcUrl } from "../lib/publicRuntime";
import { getPublicWsUrl } from "../lib/publicRuntime";
import { runApiDiagnostics, shouldRunApiDiagnostics } from "../lib/apiDiagnostics";
import { useTtaFirstAction } from "../hooks/useTtaFirstAction";
import "@solana/wallet-adapter-react-ui/styles.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
  weight: ["400", "500", "600", "700", "800", "900"]
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "600", "700", "800"]
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-space-grotesk",
  display: "swap"
});

const queryClient = new QueryClient();

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const showDevUiBadge = process.env.NODE_ENV !== "production";
  const devUiStamp = "home-compact-v2";

  useTtaFirstAction({ enabled: process.env.NODE_ENV === "production" });

  useEffect(() => {
    if (shouldRunApiDiagnostics()) {
      runApiDiagnostics();
    }
  }, []);

  const wallets = useMemo(() => createSolanaWalletAdapters(), []);
  const endpoint = useMemo(() => getPublicSolanaRpcUrl(), []);

  return (
    <>
      <Head>
        <title>Sentinel Ledger</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div className={`${inter.variable} ${jetbrainsMono.variable} ${spaceGrotesk.variable}`}>
        <AppErrorBoundary>
          <QueryClientProvider client={queryClient}>
            <ConnectionProvider endpoint={endpoint}>
              <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                  <LocaleProvider>
                    <WarModeProvider>
                      <SubscriptionModalProvider>
                        <ScoreSocketProvider wsUrl={getPublicWsUrl()}>
                          <Navbar />
                          <GlobalStatusBar />
                          <GlobalWayfinding />
                          <Component {...pageProps} />
                          <SiteFooter />
                          <GlobalCommandHud />
                          <SentinelBot />
                          <MetaMaskSolanaInit />
                          <Toaster position="bottom-right" />
                          {showDevUiBadge ? (
                            <div className="fixed bottom-2 left-2 z-[9999] rounded border border-white/10 bg-black/70 px-2 py-1 font-mono text-[10px] text-white/60">
                              {devUiStamp}
                            </div>
                          ) : null}
                        </ScoreSocketProvider>
                      </SubscriptionModalProvider>
                    </WarModeProvider>
                  </LocaleProvider>
                </WalletModalProvider>
              </WalletProvider>
            </ConnectionProvider>
          </QueryClientProvider>
        </AppErrorBoundary>
      </div>
    </>
  );
}
