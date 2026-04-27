import { useLocale } from "../contexts/LocaleContext";
import {
  InstitutionalPage,
  InstitutionalSection,
  InstitutionalCard,
  InstitutionalProse,
  InstitutionalCallout
} from "../components/institutional";

export default function PrivacyPage() {
  const { t } = useLocale();
  return (
    <InstitutionalPage
      trackerLabel="PRIVACY · POLICY"
      title={t("privacy.h1")}
      subtitle={t("privacy.lead")}
      pageHeadTitle={t("privacy.pageTitle")}
      pageHeadDescription={t("privacy.lead")}
      width="narrow"
    >
      <InstitutionalSection trackerLabel="01 · Inputs" title={t("privacy.s1h")}>
        <InstitutionalCard padded>
          <InstitutionalProse>
            <ul>
              <li>{t("privacy.s1li1")}</li>
              <li>{t("privacy.s1li2")}</li>
              <li>{t("privacy.s1li3")}</li>
              <li>{t("privacy.s1li4")}</li>
            </ul>
          </InstitutionalProse>
        </InstitutionalCard>
      </InstitutionalSection>

      <InstitutionalSection trackerLabel="02 · Payments" title={t("privacy.s2h")}>
        <InstitutionalCard padded>
          <InstitutionalProse>
            <p>{t("privacy.s2p")}</p>
          </InstitutionalProse>
        </InstitutionalCard>
      </InstitutionalSection>

      <InstitutionalSection trackerLabel="03 · Exclusions" title={t("privacy.s3h")}>
        <InstitutionalCallout tone="success" title="Never collected">
          {t("privacy.s3p")}
        </InstitutionalCallout>
      </InstitutionalSection>

      <InstitutionalSection trackerLabel="04 · Basis" title={t("privacy.s4h")}>
        <InstitutionalCard padded>
          <InstitutionalProse>
            <p>{t("privacy.s4p")}</p>
          </InstitutionalProse>
        </InstitutionalCard>
      </InstitutionalSection>

      <InstitutionalSection trackerLabel="05 · Rights" title={t("privacy.s5h")}>
        <InstitutionalCard padded tone="accent">
          <InstitutionalProse>
            <p>{t("privacy.s5p")}</p>
          </InstitutionalProse>
        </InstitutionalCard>
      </InstitutionalSection>

      <InstitutionalSection trackerLabel="06 · Retention" title={t("privacy.s6h")}>
        <InstitutionalCard padded>
          <InstitutionalProse>
            <p>{t("privacy.s6p")}</p>
          </InstitutionalProse>
        </InstitutionalCard>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
