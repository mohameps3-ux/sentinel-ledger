import { PageHead } from "../components/seo/PageHead";
import { useLocale } from "../contexts/LocaleContext";

export default function PrivacyPage() {
  const { t } = useLocale();
  return (
    <>
      <PageHead title={t("privacy.pageTitle")} description={t("privacy.lead")} />
      <div className="max-w-3xl mx-auto px-6 pt-[76px] pb-12">
        <div className="terminal-panel px-6 py-4 mb-8">
          <span className="section-title">PRIVACY</span>
          <h1 className="font-display text-2xl font-bold text-sl-text mt-1">{t("privacy.h1")}</h1>
        </div>
        <div className="terminal-panel px-6 py-6">
        <p className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("privacy.lead")}</p>

        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-sl-text mt-6 mb-3">{t("privacy.s1h")}</h2>
          <ul className="list-disc pl-5 text-gray-300 space-y-1">
            <li className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("privacy.s1li1")}</li>
            <li className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("privacy.s1li2")}</li>
            <li className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("privacy.s1li3")}</li>
            <li className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("privacy.s1li4")}</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-sl-text mt-6 mb-3">{t("privacy.s2h")}</h2>
          <p className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("privacy.s2p")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-sl-text mt-6 mb-3">{t("privacy.s3h")}</h2>
          <p className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("privacy.s3p")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-sl-text mt-6 mb-3">{t("privacy.s4h")}</h2>
          <p className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("privacy.s4p")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-sl-text mt-6 mb-3">{t("privacy.s5h")}</h2>
          <p className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("privacy.s5p")}</p>
        </section>

        <section className="space-y-2">
          <h2 className="font-display text-lg font-semibold text-sl-text mt-6 mb-3">{t("privacy.s6h")}</h2>
          <p className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("privacy.s6p")}</p>
        </section>
        </div>
      </div>
    </>
  );
}
