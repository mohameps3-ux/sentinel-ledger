import { WarModeToggle } from "../../../components/cockpit/WarModeToggle";

export default function WarHeader() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-xs text-gray-400">
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <span className="shrink-0 font-semibold text-gray-200">Inicio</span>
        <span className="hidden text-gray-500 sm:inline truncate">Señales a la izquierda · análisis del token a la derecha</span>
      </div>
      <WarModeToggle />
    </div>
  );
}
