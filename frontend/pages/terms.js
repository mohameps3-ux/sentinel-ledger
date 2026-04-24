import { PageHead } from "../components/seo/PageHead";
import { useLocale } from "../contexts/LocaleContext";

export default function TermsPage() {
  const { t } = useLocale();
  return (
    <>
      <PageHead title={t("terms.pageTitle")} description={t("terms.lead")} />
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-3xl font-bold">{t("terms.h1")}</h1>
        <p className="text-gray-300">{t("terms.lead")}</p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{t("terms.s1h")}</h2>
          <p className="text-gray-300">{t("terms.s1p")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{t("terms.s2h")}</h2>
          <p className="text-gray-300">{t("terms.s2p")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{t("terms.s3h")}</h2>
          <p className="text-gray-300">{t("terms.s3p")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{t("terms.s4h")}</h2>
          <p className="text-gray-300">{t("terms.s4p")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{t("terms.s5h")}</h2>
          <p className="text-gray-300">{t("terms.s5p")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{t("terms.s6h")}</h2>
          <p className="text-gray-300">{t("terms.s6p")}</p>
        </section>
      </div>
    </>
  );
}
