import { useLocale } from "../contexts/LocaleContext";
import {
  InstitutionalPage,
  InstitutionalSection,
  InstitutionalCard,
  InstitutionalProse,
  InstitutionalCallout
} from "../components/institutional";

export default function ContactPage() {
  const { t } = useLocale();
  return (
    <InstitutionalPage
      trackerLabel="CONTACT · DESK"
      title={t("contact.title")}
      subtitle={t("contact.p1")}
      pageHeadTitle={t("contact.pageTitle")}
      pageHeadDescription={t("contact.p1")}
      width="narrow"
    >
      <InstitutionalSection trackerLabel="01 · Channels" title="Support pathways">
        <InstitutionalCard padded>
          <InstitutionalProse>
            <p>{t("contact.p1")}</p>
          </InstitutionalProse>
        </InstitutionalCard>
      </InstitutionalSection>

      <InstitutionalSection trackerLabel="02 · Flow" title={t("contact.flowTitle")}>
        <InstitutionalCard padded tone="accent">
          <InstitutionalProse>
            <ol>
              <li>{t("contact.flow1")}</li>
              <li>{t("contact.flow2")}</li>
              <li>{t("contact.flow3")}</li>
            </ol>
          </InstitutionalProse>
        </InstitutionalCard>
      </InstitutionalSection>

      <InstitutionalSection trackerLabel="03 · Notice" title="Response window">
        <InstitutionalCallout tone="info" title="Service level">
          Operator-tier requests via /ops are prioritized. Standard requests are typically
          acknowledged within 1–3 business days; security or billing escalations bypass the queue.
        </InstitutionalCallout>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
