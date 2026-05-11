import dynamic from "next/dynamic";
import { TokenSkeleton } from "../../components/token/TokenSkeleton";

/**
 * Sin getServerSideProps: en Vercel, esta ruta con SSR de página devolvía 500 (también en /wallet/[address]).
 * Next puede mostrar la ruta como “estática” (○): es el documento HTML inicial; el terminal en sí
 * sigue siendo dinámico (mint por useRouter, datos por API, tiempo real por socket).
 */
const TokenTerminalPage = dynamic(() => import("../../components/token/TokenTerminalPage"), {
  ssr: false,
  loading: () => <TokenSkeleton />
});

export default function TokenAddressRoutePage() {
  return <TokenTerminalPage />;
}
