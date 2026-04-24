import { WarModeToggle } from "../../../components/cockpit/WarModeToggle";
import { useLocale } from "../../../contexts/LocaleContext";

export default function WarHeader() {
  const { t } = useLocale();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] sm:text-xs text-gray-400">
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        <span className="shrink-0 font-semibold text-gray-200">{t("war.header.homeLabel")}</span>
        <span className="hidden text-gray-500 sm:inline truncate">{t("war.header.tagline")}</span>
      </div>
      <WarModeToggle />
    </div>
  );
}
