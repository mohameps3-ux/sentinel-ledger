import { PageHead } from "../components/seo/PageHead";
import { useLocale } from "../contexts/LocaleContext";

export default function ContactPage() {
  const { t } = useLocale();
  return (
    <>
      <PageHead title={t("contact.pageTitle")} description={t("contact.p1")} />
      <div className="max-w-3xl mx-auto px-6 pt-[76px] pb-12">
        <div className="terminal-panel px-6 py-4 mb-8">
          <span className="section-title">CONTACT</span>
          <h1 className="font-display text-2xl font-bold text-sl-text mt-1">{t("contact.title")}</h1>
        </div>
        <section className="terminal-panel px-6 py-6">
          <p className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("contact.p1")}</p>
          <div className="border border-sl-border bg-sl-card p-4 text-sm">
            <p className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("contact.flowTitle")}</p>
            <ul className="mt-2 space-y-1 text-sl-sub">
              <li className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("contact.flow1")}</li>
              <li className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("contact.flow2")}</li>
              <li className="font-ui text-sm text-sl-sub leading-relaxed mb-4">{t("contact.flow3")}</li>
            </ul>
          </div>
        </section>
      </div>
    </>
  );
}
