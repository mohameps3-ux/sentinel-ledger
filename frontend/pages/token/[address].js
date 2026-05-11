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

/** Inline mint shape check — avoid `import()` inside GSSP (Vercel serverless + .mjs was 500). */
function isMintParam(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (t.length < 32 || t.length > 44) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(t);
}

export function getServerSideProps(context) {
  const raw = context.params?.address;
  const mint = Array.isArray(raw) ? raw[0] : raw;
  if (typeof mint !== "string") return { notFound: true };
  const trimmed = mint.trim();
  if (!isMintParam(trimmed)) {
    return { props: { routeMint: "" } };
  }
  return { props: { routeMint: trimmed } };
}

export default function TokenAddressRoutePage({ routeMint }) {
  return <TokenTerminalPage routeMint={routeMint} />;
}
