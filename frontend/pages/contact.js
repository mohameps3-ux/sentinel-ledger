import { PageHead } from "../components/seo/PageHead";
import { useLocale } from "../contexts/LocaleContext";

export default function ContactPage() {
  const { t } = useLocale();
  return (
    <>
      <PageHead title={t("contact.pageTitle")} description={t("contact.p1")} />
      <div className="sl-container py-10">
        <section className="glass-card sl-inset max-w-3xl mx-auto space-y-4">
          <p className="sl-label">{t("contact.label")}</p>
          <h1 className="sl-h2 text-white">{t("contact.title")}</h1>
          <p className="text-sm text-gray-300">{t("contact.p1")}</p>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm">
            <p className="text-gray-400">{t("contact.flowTitle")}</p>
            <ul className="mt-2 space-y-1 text-gray-200">
              <li>• {t("contact.flow1")}</li>
              <li>• {t("contact.flow2")}</li>
              <li>• {t("contact.flow3")}</li>
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}
