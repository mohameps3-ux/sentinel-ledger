import { WarModeToggle } from "../../../components/cockpit/WarModeToggle";

export default function WarHeader() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-xs text-gray-400">
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <span className="shrink-0 font-semibold uppercase tracking-[0.16em] text-gray-500">War cockpit</span>
        <span className="hidden text-gray-600 sm:inline truncate">Feed + Intel desk · tabs LIVE / HOT / HISTORY</span>
      </div>
      <WarModeToggle />
    </div>
  );
}
