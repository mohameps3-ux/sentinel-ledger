import { useLocale } from "../contexts/LocaleContext";
import {
  InstitutionalPage,
  InstitutionalSection,
  InstitutionalCard,
  InstitutionalProse,
  InstitutionalCallout
} from "../components/institutional";

export default function LegalNoticePage() {
  const { t } = useLocale();
  return (
    <InstitutionalPage
      trackerLabel="LEGAL · DOCTRINE"
      title={t("legal.title")}
      subtitle={t("legal.p1")}
      pageHeadTitle={t("legal.pageTitle")}
      pageHeadDescription={t("legal.p1")}
      width="narrow"
    >
      <InstitutionalSection trackerLabel="01 · Scope" title="Operating boundaries">
        <InstitutionalCard padded>
          <InstitutionalProse>
            <p>{t("legal.p1")}</p>
            <p>{t("legal.p2")}</p>
          </InstitutionalProse>
        </InstitutionalCard>
      </InstitutionalSection>

      <InstitutionalSection trackerLabel="02 · Notice" title="Risk disclaimer">
        <InstitutionalCallout tone="warn" title="Not financial advice">
          Information surfaced by Sentinel Ledger is educational and informational. Trading on-chain
          assets carries substantial risk of loss. You are solely responsible for any decision made
          on the basis of signals, narratives, scores, or simulations rendered by this platform.
        </InstitutionalCallout>
      </InstitutionalSection>
    </InstitutionalPage>
  );
}
