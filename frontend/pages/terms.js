import { useLocale } from "../contexts/LocaleContext";
import {
  InstitutionalPage,
  InstitutionalSection,
  InstitutionalCard,
  InstitutionalProse,
  InstitutionalCallout
} from "../components/institutional";

export default function TermsPage() {
  const { t } = useLocale();
  return (
    <InstitutionalPage
      trackerLabel="TERMS · AGREEMENT"
      title={t("terms.h1")}
      subtitle={t("terms.lead")}
      pageHeadTitle={t("terms.pageTitle")}
      pageHeadDescription={t("terms.lead")}
      width="narrow"
    >
      <InstitutionalSection trackerLabel="01 · Disclaimer" title={t("terms.s1h")}>
        <InstitutionalCallout tone="warn" title="No financial advice">
          {t("terms.s1p")}
        </InstitutionalCallout>
      </InstitutionalSection>

      <InstitutionalSection trackerLabel="02 · Eligibility" title={t("terms.s2h")}>
        <InstitutionalCard padded>
          <InstitutionalProse>
            <p>{t("terms.s2p")}</p>
          </InstitutionalProse>
        </InstitutionalCard>
      </InstitutionalSection>

      <InstitutionalSection trackerLabel="03 · Use" title={t("terms.s3h")}>
        <InstitutionalCard padded>
          <InstitutionalProse>
            <p>{t("terms.s3p")}</p>
          </InstitutionalProse>
        </InstitutionalCard>
      </InstitutionalSection>

      <InstitutionalSection trackerLabel="04 · Liability" title={t("terms.s4h")}>
        <InstitutionalCard padded tone="loss">
          <InstitutionalProse>
            <p>{t("terms.s4p")}</p>
          </InstitutionalProse>
        </InstitutionalCard>
      </InstitutionalSection>

      <InstitutionalSection trackerLabel="05 · Subscriptions" title={t("terms.s5h")}>
        <InstitutionalCard padded>
          <InstitutionalProse>
            <p>{t("terms.s5p")}</p>
          </InstitutionalProse>
        </InstitutionalCard>
      </InstitutionalSection>

      <InstitutionalSection trackerLabel="06 · Governing law" title={t("terms.s6h")}>
        <InstitutionalCard padded>
          <InstitutionalProse>
            <p>{t("terms.s6p")}</p>
          </InstitutionalProse>
        </InstitutionalCard>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
