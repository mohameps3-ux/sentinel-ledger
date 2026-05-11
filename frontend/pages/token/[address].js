import dynamic from "next/dynamic";
import { TokenSkeleton } from "../../components/token/TokenSkeleton";

/**
 * Route shell: sin `socket.io-client` a nivel de módulo; UI pesada en cliente (`ssr: false`).
 * GSSP devuelve `routeMint` serializado (no `props: {}` vacío) para SSR real y evitar el 500 en Vercel.
 */
const TokenTerminalPage = dynamic(() => import("../../components/token/TokenTerminalPage"), {
  ssr: false,
  loading: () => <TokenSkeleton />
});

export async function getServerSideProps(context) {
  const raw = context.params?.address;
  const mint = Array.isArray(raw) ? raw[0] : raw;
  if (typeof mint !== "string") return { notFound: true };
  const trimmed = mint.trim();
  const { isProbableSolanaMint } = await import("../../lib/solanaMint.mjs");
  if (!isProbableSolanaMint(trimmed)) {
    return { props: { routeMint: "" } };
  }
  return { props: { routeMint: trimmed } };
}

export default function TokenAddressRoutePage({ routeMint }) {
  return <TokenTerminalPage routeMint={routeMint} />;
}
