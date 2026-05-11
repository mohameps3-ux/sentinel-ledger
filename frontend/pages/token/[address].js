import dynamic from "next/dynamic";
import { TokenSkeleton } from "../../components/token/TokenSkeleton";

/**
 * Route shell only: no top-level `socket.io-client`; heavy UI loads client-side (`ssr: false`).
 * No getServerSideProps so Next can emit a static shell (Vercel returned hard 500 for this path
 * with an empty GSSP while `/wallet/[address]` behaved the same). Mint resolves in the client via `useRouter`.
 */
const TokenTerminalPage = dynamic(() => import("../../components/token/TokenTerminalPage"), {
  ssr: false,
  loading: () => <TokenSkeleton />
});

export default function TokenAddressRoutePage() {
  return <TokenTerminalPage />;
}
