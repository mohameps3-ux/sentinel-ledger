import { PageHead } from "../components/seo/PageHead";
import { useLocale } from "../contexts/LocaleContext";

export default function PrivacyPage() {
  const { t } = useLocale();
  return (
    <>
      <PageHead title={t("privacy.pageTitle")} description={t("privacy.lead")} />
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <h1 className="text-3xl font-bold">{t("privacy.h1")}</h1>
        <p className="text-gray-300">{t("privacy.lead")}</p>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{t("privacy.s1h")}</h2>
          <ul className="list-disc pl-5 text-gray-300 space-y-1">
            <li>{t("privacy.s1li1")}</li>
            <li>{t("privacy.s1li2")}</li>
            <li>{t("privacy.s1li3")}</li>
            <li>{t("privacy.s1li4")}</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{t("privacy.s2h")}</h2>
          <p className="text-gray-300">{t("privacy.s2p")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{t("privacy.s3h")}</h2>
          <p className="text-gray-300">{t("privacy.s3p")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{t("privacy.s4h")}</h2>
          <p className="text-gray-300">{t("privacy.s4p")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{t("privacy.s5h")}</h2>
          <p className="text-gray-300">{t("privacy.s5p")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-semibold">{t("privacy.s6h")}</h2>
          <p className="text-gray-300">{t("privacy.s6p")}</p>
        </section>
      </div>
    </>
  );
}
