/* Must stay in _app: global Tailwind + design tokens (Next.js only allows global CSS import from here). */
import "../styles/globals.css";
import { Inter } from "next/font/google";
import { useEffect, useMemo } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WarModeProvider } from "../contexts/WarModeContext";
import { LocaleProvider } from "../contexts/LocaleContext";
import { Toaster } from "react-hot-toast";
import { AppErrorBoundary } from "../components/layout/AppErrorBoundary";
import { Navbar } from "../components/layout/Navbar";
import { GlobalWayfinding } from "../components/layout/GlobalWayfinding";
import { LiveTensionBar } from "../components/layout/LiveTensionBar";
import { SiteFooter } from "../components/layout/SiteFooter";
import { GlobalCommandHud } from "../components/terminal/GlobalCommandHud";
import { MetaMaskSolanaInit } from "../components/wallet/MetaMaskSolanaInit";
import { createSolanaWalletAdapters } from "../lib/solanaWalletAdapters";
import { getPublicSolanaRpcUrl } from "../lib/publicRuntime";
import { getPublicWsUrl } from "../lib/publicRuntime";
import { useTtaFirstAction } from "../hooks/useTtaFirstAction";
import io from "socket.io-client";
import "@solana/wallet-adapter-react-ui/styles.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"]
});

const queryClient = new QueryClient();

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const isHome = router.pathname === "/";
  const showDevUiBadge = process.env.NODE_ENV !== "production";
  const devUiStamp = "home-compact-v2";
  const buildStamp = process.env.NEXT_PUBLIC_GIT_SHA || "local";
  const endpoint = useMemo(() => getPublicSolanaRpcUrl(), []);
  const wallets = useMemo(() => createSolanaWalletAdapters(), []);
  useTtaFirstAction(router);

  useEffect(() => {
    document.documentElement.dataset.sentinelClient = "1";
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("token");
    if (!token) return;
    const sock = io(getPublicWsUrl(), {
      transports: ["websocket", "polling"],
      reconnection: true
    });
    sock.on("connect", () => {
      sock.emit("join-user", { token });
    });
    sock.on("wallet-stalk", (event) => {
      try {
        const prev = Number(localStorage.getItem("walletStalkerUnread") || 0);
        localStorage.setItem("walletStalkerUnread", String(prev + 1));
        const existing = JSON.parse(localStorage.getItem("walletStalkerEvents") || "[]");
        const next = [event, ...existing].slice(0, 40);
        localStorage.setItem("walletStalkerEvents", JSON.stringify(next));
        window.dispatchEvent(new Event("wallet-stalker-update"));
      } catch (_) {}
    });
    return () => {
      sock.close();
    };
  }, []);

  return (
    <>
      <Head>
        {/* viewport: see pages/_document.js (single tag, avoids duplicates) */}
        <meta name="theme-color" content="#070709" />
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
            <LocaleProvider>
            <WarModeProvider>
            <div
              className={`${inter.className} min-h-screen bg-[#070709] text-white antialiased selection:bg-emerald-500/25 selection:text-emerald-100`}
              translate="no"
            >
              <Navbar />
              {isHome ? <LiveTensionBar /> : null}
              {/* padding-top is derived from CSS variables published by the
                  fixed top chrome (see :root in globals.css and the
                  `data-has-tension-bar` contract in LiveTensionBar.jsx).
                  This main no longer needs to know which page it is on. */}
              <main
                style={{
                  paddingTop:
                    "calc(var(--sl-nav-actual, var(--sl-nav-h)) + var(--sl-bar-h) + var(--sl-safe-gap))"
                }}
                className="pb-24 md:pb-14 safe-bottom-pad w-full max-w-[100vw] overflow-x-clip min-w-0"
              >
                {/* Home renders GlobalWayfinding inside the cockpit feed so the War band is first paint. */}
                {!isHome ? <GlobalWayfinding /> : null}
                <AppErrorBoundary>
                  <Component {...pageProps} />
                </AppErrorBoundary>
              </main>
              <GlobalCommandHud />
              <SiteFooter />
              {showDevUiBadge ? (
                <div className="fixed left-2 bottom-2 z-[260] pointer-events-none select-none text-[10px] leading-tight px-2 py-1 rounded-md border border-cyan-500/35 bg-[#0a0f14]/90 text-cyan-200 font-mono shadow-[0_0_14px_rgba(34,211,238,0.18)]">
                  DEV · UI {devUiStamp} · BUILD {buildStamp}
                </div>
              ) : null}
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
            </WarModeProvider>
            </LocaleProvider>
          </QueryClientProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
    </>
  );
}

