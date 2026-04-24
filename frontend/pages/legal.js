import { PageHead } from "../components/seo/PageHead";
import { useLocale } from "../contexts/LocaleContext";

export default function LegalNoticePage() {
  const { t } = useLocale();
  return (
    <>
      <PageHead title={t("legal.pageTitle")} description={t("legal.p1")} />
      <div className="sl-container py-10">
        <section className="glass-card sl-inset max-w-4xl mx-auto space-y-4">
          <p className="sl-label">{t("legal.label")}</p>
          <h1 className="sl-h2 text-white">{t("legal.title")}</h1>
          <p className="text-sm text-gray-300">{t("legal.p1")}</p>
          <p className="text-sm text-gray-400">{t("legal.p2")}</p>
        </section>
      </div>
    </>
  );
}
