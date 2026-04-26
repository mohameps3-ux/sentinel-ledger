import { PageHead } from "../components/seo/PageHead";
import { useLocale } from "../contexts/LocaleContext";

export default function LegalNoticePage() {
  const { t } = useLocale();
  return (
    <>
      <PageHead title={t("legal.pageTitle")} description={t("legal.p1")} />
      <div className="max-w-3xl mx-auto px-6 pt-[76px] pb-12">
        <div className="terminal-panel px-6 py-4 mb-8">
          <span className="section-title">LEGAL</span>
          <h1 className="font-display text-2xl font-bold text-sl-text mt-1">{t("legal.title")}</h1>
        </div>
        <section className="terminal-panel px-6 py-6">
          <p className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("legal.p1")}</p>
          <p className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("legal.p2")}</p>
        </section>
      </div>
    </>
  );
}
