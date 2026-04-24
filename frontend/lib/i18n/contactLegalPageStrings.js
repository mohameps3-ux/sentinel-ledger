/** Contact + Legal notice pages */

function S(en, overrides = {}) {
  const codes = ["en", "es", "fr", "de", "it", "ru", "zh", "ko", "ja", "ar", "pt", "nl", "pl", "tr", "hi", "vi"];
  const row = { en };
  for (const c of codes) {
    if (c === "en") continue;
    row[c] = overrides[c] ?? en;
  }
  return row;
}

/** @type {Record<string, Record<string, string>>} */
export const CONTACT_LEGAL_PAGE_STRINGS = {
  "contact.pageTitle": S("Contact — Sentinel Ledger", {
    es: "Contacto — Sentinel Ledger",
    fr: "Contact — Sentinel Ledger",
    de: "Kontakt — Sentinel Ledger",
    it: "Contatto — Sentinel Ledger",
    ru: "Контакт — Sentinel Ledger",
    zh: "联系 — Sentinel Ledger",
    ko: "문의 — Sentinel Ledger",
    ja: "お問い合わせ — Sentinel Ledger",
    ar: "اتصل — Sentinel Ledger",
    pt: "Contacto — Sentinel Ledger"
  }),
  "contact.label": S("Contact", {
    es: "Contacto",
    fr: "Contact",
    de: "Kontakt",
    it: "Contatto",
    ru: "Контакт",
    zh: "联系",
    ko: "문의",
    ja: "お問い合わせ",
    ar: "اتصل",
    pt: "Contacto"
  }),
  "contact.title": S("Get in touch", {
    es: "Contacto",
    fr: "Nous contacter",
    de: "Kontakt aufnehmen",
    it: "Contattaci",
    ru: "Связаться",
    zh: "取得联系",
    ko: "문의하기",
    ja: "お問い合わせ",
    ar: "تواصل معنا",
    pt: "Contacto"
  }),
  "contact.p1": S(
    "For billing, account, or security issues, use the in-app support / ops channel.",
    {
      es: "Para facturación, cuenta o seguridad, usa el canal de soporte u ops dentro de la app.",
      fr: "Pour la facturation, le compte ou la sécurité, utilisez le support / ops intégré.",
      de: "Für Abrechnung, Konto oder Sicherheit nutzen Sie den In-App-Support bzw. Ops-Kanal.",
      it: "Per fatturazione, account o sicurezza usa il supporto / ops in-app.",
      ru: "По оплате, аккаунту или безопасности — канал поддержки / ops в приложении.",
      zh: "账单、账户或安全问题请使用应用内支持或运维渠道。",
      ko: "결제·계정·보안은 앱 내 지원/운영 채널을 이용하세요.",
      ja: "請求・アカウント・セキュリティはアプリ内サポート／運用へ。",
      ar: "للفوترة أو الحساب أو الأمان استخدم قناة الدعم أو العمليات داخل التطبيق.",
      pt: "Para faturação, conta ou segurança, use o suporte / ops na app."
    }
  ),
  "contact.flowTitle": S("Preferred support flow:", {
    es: "Flujo de soporte preferido:",
    fr: "Flux de support recommandé :",
    de: "Bevorzugter Support-Ablauf:",
    it: "Flusso di supporto consigliato:",
    ru: "Рекомендуемый порядок обращения:",
    zh: "建议支持流程：",
    ko: "권장 지원 절차:",
    ja: "推奨サポート手順:",
    ar: "مسار الدعم المفضل:",
    pt: "Fluxo de suporte preferido:"
  }),
  "contact.flow1": S("Open /ops if you are an operator.", {
    es: "Abre /ops si eres operador.",
    fr: "Ouvrez /ops si vous êtes opérateur.",
    de: "Öffnen Sie /ops, wenn Sie Operator sind.",
    it: "Apri /ops se sei operatore.",
    ru: "Откройте /ops, если вы оператор.",
    zh: "若是运维人员请打开 /ops。",
    ko: "운영자라면 /ops를 여세요.",
    ja: "運用者なら /ops を開く。",
    ar: "افتح /ops إن كنت مشغّلًا.",
    pt: "Abra /ops se for operador."
  }),
  "contact.flow2": S("Use Telegram / Omni support entry if enabled.", {
    es: "Usa la entrada de soporte Telegram / Omni si está activada.",
    fr: "Utilisez l’entrée support Telegram / Omni si activée.",
    de: "Nutzen Sie Telegram-/Omni-Support, falls aktiviert.",
    it: "Usa l’ingresso supporto Telegram / Omni se abilitato.",
    ru: "Используйте Telegram / Omni, если включено.",
    zh: "若已启用，请使用 Telegram / Omni 支持入口。",
    ko: "활성화된 경우 텔레그램/Omni 지원으로.",
    ja: "有効ならTelegram／Omniサポートへ。",
    ar: "استخدم دعم Telegram / Omni إن كان مفعّلًا.",
    pt: "Use a entrada de suporte Telegram / Omni se estiver ativa."
  }),
  "contact.flow3": S("Include wallet address, timestamp, and expected behavior.", {
    es: "Incluye dirección de wallet, marca de tiempo y comportamiento esperado.",
    fr: "Indiquez l’adresse du portefeuille, l’horodatage et le comportement attendu.",
    de: "Wallet-Adresse, Zeitstempel und erwartetes Verhalten angeben.",
    it: "Includi indirizzo wallet, timestamp e comportamento atteso.",
    ru: "Укажите адрес кошелька, время и ожидаемое поведение.",
    zh: "请附上钱包地址、时间戳和预期行为。",
    ko: "지갑 주소, 시각, 기대 동작을 포함하세요.",
    ja: "ウォレットアドレス・時刻・期待動作を含める。",
    ar: "اذكر عنوان المحفظة والطابع الزمني والسلوك المتوقع.",
    pt: "Inclua endereço da carteira, carimbo de data/hora e comportamento esperado."
  }),

  "legal.pageTitle": S("Legal notice — Sentinel Ledger", {
    es: "Aviso legal — Sentinel Ledger",
    fr: "Mentions légales — Sentinel Ledger",
    de: "Rechtlicher Hinweis — Sentinel Ledger",
    it: "Note legali — Sentinel Ledger",
    ru: "Правовая информация — Sentinel Ledger",
    zh: "法律声明 — Sentinel Ledger",
    ko: "법적 고지 — Sentinel Ledger",
    ja: "法的表示 — Sentinel Ledger",
    ar: "إشعار قانوني — Sentinel Ledger",
    pt: "Aviso legal — Sentinel Ledger"
  }),
  "legal.label": S("Legal notice", {
    es: "Aviso legal",
    fr: "Mentions légales",
    de: "Rechtlicher Hinweis",
    it: "Note legali",
    ru: "Правовая информация",
    zh: "法律声明",
    ko: "법적 고지",
    ja: "法的表示",
    ar: "إشعار قانوني",
    pt: "Aviso legal"
  }),
  "legal.title": S("Legal notice", {
    es: "Aviso legal",
    fr: "Mentions légales",
    de: "Rechtlicher Hinweis",
    it: "Note legali",
    ru: "Правовая информация",
    zh: "法律声明",
    ko: "법적 고지",
    ja: "法的表示",
    ar: "إشعار قانوني",
    pt: "Aviso legal"
  }),
  "legal.p1": S(
    "Sentinel Ledger is an informational analytics platform focused on blockchain market intelligence. It does not execute trades on behalf of users and does not provide regulated investment advice.",
    {
      es: "Sentinel Ledger es una plataforma analítica informativa centrada en inteligencia de mercado on-chain. No ejecuta operaciones por los usuarios ni ofrece asesoramiento de inversión regulado.",
      fr: "Sentinel Ledger est une plateforme d’analyse informative axée sur l’intelligence de marché blockchain. Elle n’exécute pas d’ordres pour les utilisateurs et ne fournit pas de conseil d’investissement réglementé.",
      de: "Sentinel Ledger ist eine informative Analyseplattform für Blockchain-Marktintelligenz. Sie führt keine Trades für Nutzer aus und bietet keine regulierte Anlageberatung.",
      it: "Sentinel Ledger è una piattaforma analitica informativa sull’intelligence di mercato blockchain. Non esegue operazioni per conto degli utenti né fornisce consulenza di investimento regolamentata.",
      ru: "Sentinel Ledger — информационная аналитическая платформа по рыночной аналитике блокчейна. Не исполняет сделки за пользователей и не даёт регулируемых инвестиционных рекомендаций.",
      zh: "Sentinel Ledger 是面向链上市场情报的信息分析平台。不代用户执行交易，也不提供受监管的投资建议。",
      ko: "Sentinel Ledger는 온체인 시장 인텔리전스에 초점을 둔 정보 분석 플랫폼입니다. 사용자 대신 거래를 실행하지 않으며 규제된 투자 자문을 제공하지 않습니다.",
      ja: "Sentinel Ledgerはオンチェーン市場インテリジェンスに特化した情報分析プラットフォームです。ユーザーの代わりに取引を実行せず、規制された投資助言も行いません。",
      ar: "Sentinel Ledger منصة تحليلات معلوماتية تركز على ذكاء سوق البلوكشين. لا تنفّذ صفقات نيابة عن المستخدمين ولا تقدم استشارات استثمارية خاضعة للتنظيم.",
      pt: "Sentinel Ledger é uma plataforma analítica informativa focada em inteligência de mercado on-chain. Não executa trades pelos utilizadores nem fornece aconselhamento de investimento regulado."
    }
  ),
  "legal.p2": S(
    "Any reference to expected returns, signal confidence, or historical patterns is for product simulation / educational context and should not be interpreted as guaranteed outcomes.",
    {
      es: "Cualquier referencia a rentabilidades esperadas, confianza de señales o patrones históricos es con fines de simulación / educación y no debe interpretarse como resultado garantizado.",
      fr: "Toute mention de rendements attendus, de confiance des signaux ou de motifs historiques relève de la simulation / pédagogie et ne constitue pas un résultat garanti.",
      de: "Hinweise auf erwartete Renditen, Signalvertrauen oder historische Muster dienen der Simulation / Bildung und sind keine garantierten Ergebnisse.",
      it: "Riferimenti a rendimenti attesi, confidenza del segnale o pattern storici sono a scopo simulativo / didattico e non garanzia di risultati.",
      ru: "Упоминания ожидаемой доходности, уверенности сигналов или исторических паттернов — для симуляции / обучения, не гарантия результата.",
      zh: "对预期收益、信号置信度或历史模式的任何表述仅用于产品模拟/教育语境，不应理解为保证结果。",
      ko: "기대 수익, 시그널 신뢰도, 과거 패턴 언급은 제품 시뮬레이션/교육 목적이며 보장된 결과가 아닙니다.",
      ja: "期待リターン・シグナル信頼度・過去パターンの言及はシミュレーション／教育用であり成果を保証するものではありません。",
      ar: "أي إشارة إلى عوائد متوقعة أو ثقة الإشارة أو أنماط تاريخية هي لسياق المحاكاة/التعليم ولا تعني نتائج مضمونة.",
      pt: "Referências a retornos esperados, confiança do sinal ou padrões históricos são para simulação / contexto educativo e não resultados garantidos."
    }
  )
};
