import { S } from "./stringRow";

/** @type {Record<string, Record<string, string>>} */
export const PRIVACY_TERMS_PAGE_STRINGS = {
  "privacy.pageTitle": S("Privacy Policy — Sentinel Ledger", {
    es: "Política de privacidad — Sentinel Ledger",
    fr: "Politique de confidentialité — Sentinel Ledger",
    de: "Datenschutz — Sentinel Ledger",
    it: "Privacy — Sentinel Ledger",
    ru: "Политика конфиденциальности — Sentinel Ledger",
    zh: "隐私政策 — Sentinel Ledger",
    ko: "개인정보 처리방침 — Sentinel Ledger",
    ja: "プライバシーポリシー — Sentinel Ledger",
    ar: "سياسة الخصوصية — Sentinel Ledger",
    pt: "Política de privacidade — Sentinel Ledger"
  }),
  "privacy.h1": S("Privacy Policy", { es: "Política de privacidad", fr: "Politique de confidentialité", de: "Datenschutz" }),
  "privacy.lead": S("This policy explains what data Sentinel Ledger processes and why.", {
    es: "Esta política explica qué datos procesa Sentinel Ledger y por qué."
  }),
  "privacy.s1h": S("Data We Process", { es: "Datos que tratamos", fr: "Données traitées", de: "Verarbeitete Daten" }),
  "privacy.s1li1": S("Public wallet address for authentication and account linking.", {
    es: "Dirección pública de wallet para autenticación y vinculación de cuenta."
  }),
  "privacy.s1li2": S("Optional Telegram identifiers (ID and username) if provided.", {
    es: "Identificadores opcionales de Telegram (ID y usuario) si los proporcionas."
  }),
  "privacy.s1li3": S(
    "Email address if you provide it during checkout or account flows (processed by our payment provider).",
    { es: "Correo si lo indicas en el pago o flujos de cuenta (lo procesa nuestro proveedor de pagos)." }
  ),
  "privacy.s1li4": S("App usage data required for watchlists, notes, and alerts.", {
    es: "Datos de uso necesarios para watchlists, notas y alertas."
  }),
  "privacy.s2h": S("Payments (Stripe)", { es: "Pagos (Stripe)", fr: "Paiements (Stripe)", de: "Zahlungen (Stripe)" }),
  "privacy.s2p": S(
    "Payments are processed by Stripe. We do not store full card numbers on our servers. Stripe may process billing details, tax location, and transaction records according to its own privacy policy. Enabling Stripe Tax is configured in the Stripe Dashboard.",
    {
      es: "Los pagos los procesa Stripe. No guardamos números completos de tarjeta en nuestros servidores. Stripe puede tratar datos de facturación, ubicación fiscal y transacciones según su política. Stripe Tax se configura en el panel de Stripe."
    }
  ),
  "privacy.s3h": S("Data We Do Not Process", { es: "Datos que no tratamos", de: "Daten, die wir nicht verarbeiten" }),
  "privacy.s3p": S("We never request or store private keys, seed phrases, or wallet secrets.", {
    es: "Nunca pedimos ni almacenamos claves privadas, frases semilla ni secretos de wallet."
  }),
  "privacy.s4h": S("Purpose and Legal Basis", { es: "Finalidad y base legal", fr: "Finalité et base juridique" }),
  "privacy.s4p": S(
    "Data is used to operate the service, authenticate users, and provide requested features. Processing is based on legitimate interest and user consent where required.",
    {
      es: "Los datos sirven para operar el servicio, autenticar usuarios y ofrecer las funciones solicitadas. El tratamiento se basa en interés legítimo y consentimiento cuando procede."
    }
  ),
  "privacy.s5h": S("Your Rights (GDPR)", { es: "Tus derechos (RGPD)", fr: "Vos droits (RGPD)" }),
  "privacy.s5p": S(
    "You may request access, correction, deletion, portability, or restriction of your personal data, and you may object to processing where applicable.",
    {
      es: "Puedes solicitar acceso, rectificación, supresión, portabilidad o limitación de tus datos personales, y oponerte al tratamiento cuando corresponda."
    }
  ),
  "privacy.s6h": S("Retention and Security", { es: "Conservación y seguridad", fr: "Conservation et sécurité" }),
  "privacy.s6p": S(
    "We retain only data required to provide the service and apply reasonable technical and organizational safeguards.",
    {
      es: "Conservamos solo los datos necesarios para prestar el servicio y aplicamos medidas técnicas y organizativas razonables."
    }
  ),

  "terms.pageTitle": S("Terms and Conditions — Sentinel Ledger", {
    es: "Términos y condiciones — Sentinel Ledger",
    fr: "Conditions générales — Sentinel Ledger",
    de: "AGB — Sentinel Ledger",
    it: "Termini e condizioni — Sentinel Ledger",
    ru: "Условия использования — Sentinel Ledger",
    zh: "条款与条件 — Sentinel Ledger",
    ko: "이용 약관 — Sentinel Ledger",
    ja: "利用規約 — Sentinel Ledger",
    ar: "الشروط والأحكام — Sentinel Ledger",
    pt: "Termos e condições — Sentinel Ledger"
  }),
  "terms.h1": S("Terms and Conditions", { es: "Términos y condiciones", fr: "Conditions générales", de: "Allgemeine Geschäftsbedingungen" }),
  "terms.lead": S("By using Sentinel Ledger, you agree to these terms.", {
    es: "Al usar Sentinel Ledger, aceptas estos términos."
  }),
  "terms.s1h": S("No Financial Advice", { es: "Sin asesoramiento financiero", fr: "Pas de conseil financier" }),
  "terms.s1p": S(
    "Sentinel Ledger provides analytics and risk signals for informational purposes only. Content does not constitute investment, legal, tax, or financial advice.",
    {
      es: "Sentinel Ledger ofrece analíticas y señales de riesgo solo con fines informativos. El contenido no constituye asesoramiento de inversión, legal, fiscal ni financiero."
    }
  ),
  "terms.s2h": S("User Responsibility", { es: "Responsabilidad del usuario", fr: "Responsabilité de l’utilisateur" }),
  "terms.s2p": S(
    "You are solely responsible for your actions, wallet interactions, and trading decisions. Always perform your own due diligence.",
    {
      es: "Eres el único responsable de tus acciones, interacciones con la wallet y decisiones de trading. Haz siempre tu propia diligencia debida."
    }
  ),
  "terms.s3h": S("Wallet Consent", { es: "Consentimiento de wallet", fr: "Consentement du portefeuille" }),
  "terms.s3p": S(
    "By connecting your wallet and signing authentication messages, you explicitly consent to wallet-based account access in the app. Signing for login does not authorize token transfers.",
    {
      es: "Al conectar tu wallet y firmar mensajes de autenticación, consientes explícitamente el acceso a cuenta basado en wallet en la app. Firmar para iniciar sesión no autoriza transferencias de tokens."
    }
  ),
  "terms.s4h": S("Limitation of Liability", { es: "Limitación de responsabilidad", fr: "Limitation de responsabilité" }),
  "terms.s4p": S(
    'Sentinel Ledger is provided "as is" without warranties. We are not liable for losses, missed opportunities, or damages arising from use of the platform.',
    {
      es: 'Sentinel Ledger se ofrece "tal cual" sin garantías. No somos responsables de pérdidas, oportunidades perdidas o daños derivados del uso de la plataforma.'
    }
  ),
  "terms.s5h": S("Changes", { es: "Cambios", fr: "Modifications", de: "Änderungen" }),
  "terms.s5p": S(
    "We may update these terms at any time. Continued use of the app means acceptance of updated terms.",
    {
      es: "Podemos actualizar estos términos en cualquier momento. El uso continuado implica la aceptación de los términos actualizados."
    }
  ),
  "terms.s6h": S("Refunds", { es: "Reembolsos", fr: "Remboursements", de: "Erstattungen" }),
  "terms.s6p": S(
    "For subscription or one-time purchases processed through Stripe, you may request a full refund within 24 hours of purchase. After 24 hours, refunds are not guaranteed. Contact support for exceptional cases. Nothing in this section limits your statutory consumer rights where applicable.",
    {
      es: "Para suscripciones o compras únicas procesadas con Stripe, puedes solicitar reembolso íntegro en las 24 horas posteriores a la compra. Pasadas 24 horas, el reembolso no está garantizado. Contacta con soporte para casos excepcionales. Nada en esta sección limita tus derechos legales de consumidor cuando correspondan."
    }
  )
};
