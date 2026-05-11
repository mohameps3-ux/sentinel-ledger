import dynamic from "next/dynamic";
import { TokenSkeleton } from "../../components/token/TokenSkeleton";

/**
 * Route shell only: do not import hooks that pull `socket.io-client` (or other browser-only init) at module scope.
 * Next evaluates `pages/token/[address].js` on the server for every document request; the previous monolithic page
 * imported `useWebSocket` → `socket.io-client`, which can throw during serverless bundle init → hard HTML 500 before React runs.
 * The real UI loads from a separate chunk after hydration (`ssr: false`).
 */
const TokenTerminalPage = dynamic(() => import("../../components/token/TokenTerminalPage"), {
  ssr: false,
  loading: () => <TokenSkeleton />
});

export async function getServerSideProps() {
  return { props: {} };
}

export default function TokenAddressRoutePage() {
  return <TokenTerminalPage />;
}
