/**
 * Wallet profile page + narrative card (flat i18n). Omitted locale codes → English.
 */

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
export const WALLET_FLAT_STRINGS = {
  "common.cache": S("cache", {
    es: "caché",
    fr: "cache",
    de: "Cache",
    it: "cache",
    ru: "кэш",
    zh: "缓存",
    ko: "캐시",
    ja: "キャッシュ",
    ar: "مخبأ",
    pt: "cache"
  }),
  "common.live": S("live", {
    es: "en vivo",
    fr: "direct",
    de: "live",
    it: "live",
    ru: "лайв",
    zh: "实时",
    ko: "라이브",
    ja: "ライブ",
    ar: "مباشر",
    pt: "ao vivo"
  }),

  "wallet.narrative.loading": S("Generating narrative...", {
    es: "Generando narrativa...",
    fr: "Génération du récit…",
    de: "Erzählung wird erstellt…",
    it: "Generazione narrativa…",
    ru: "Формируем нарратив…",
    zh: "正在生成叙事…",
    ko: "내러티브 생성 중…",
    ja: "ナラティブ生成中…",
    ar: "جاري إنشاء السرد…",
    pt: "A gerar narrativa…"
  }),
  "wallet.narrative.errorTitle": S("Could not build narrative", {
    es: "No se pudo generar narrativa",
    fr: "Impossible de générer le récit",
    de: "Erzählung konnte nicht erstellt werden",
    it: "Impossibile creare la narrativa",
    ru: "Не удалось построить нарратив",
    zh: "无法生成叙事",
    ko: "내러티브를 만들 수 없습니다",
    ja: "ナラティブを生成できませんでした",
    ar: "تعذر إنشاء السرد",
    pt: "Não foi possível gerar a narrativa"
  }),
  "wallet.narrative.headlineFallback": S("Wallet narrative", {
    es: "Narrativa de wallet",
    fr: "Récit du portefeuille",
    de: "Wallet-Erzählung",
    it: "Narrativa del wallet",
    ru: "Нарратив кошелька",
    zh: "钱包叙事",
    ko: "지갑 내러티브",
    ja: "ウォレットナラティブ",
    ar: "سرد المحفظة",
    pt: "Narrativa da carteira"
  }),

  "wallet.summary.loading": S("Loading summary...", {
    es: "Cargando resumen...",
    fr: "Chargement du résumé…",
    de: "Zusammenfassung wird geladen…",
    it: "Caricamento riepilogo…",
    ru: "Загрузка сводки…",
    zh: "正在加载摘要…",
    ko: "요약 불러오는 중…",
    ja: "要約を読み込み中…",
    ar: "جاري تحميل الملخص…",
    pt: "A carregar resumo…"
  }),
  "wallet.summary.notFound": S("Wallet not found in smart_wallets yet.", {
    es: "La wallet aún no está en smart_wallets.",
    fr: "Portefeuille introuvable dans smart_wallets pour l’instant.",
    de: "Wallet noch nicht in smart_wallets.",
    it: "Wallet non ancora in smart_wallets.",
    ru: "Кошелёк пока не найден в smart_wallets.",
    zh: "该钱包尚未出现在 smart_wallets 中。",
    ko: "아직 smart_wallets에 없는 지갑입니다.",
    ja: "smart_wallets にまだありません。",
    ar: "المحفظة غير موجودة في smart_wallets بعد.",
    pt: "Carteira ainda não está em smart_wallets."
  }),
  "wallet.summary.loadError": S("Could not load wallet summary ({{error}}).", {
    es: "No se pudo cargar el resumen ({{error}}).",
    fr: "Impossible de charger le résumé ({{error}}).",
    de: "Zusammenfassung konnte nicht geladen werden ({{error}}).",
    it: "Impossibile caricare il riepilogo ({{error}}).",
    ru: "Не удалось загрузить сводку ({{error}}).",
    zh: "无法加载钱包摘要（{{error}}）。",
    ko: "요약을 불러올 수 없습니다 ({{error}}).",
    ja: "要約を読み込めませんでした（{{error}}）。",
    ar: "تعذر تحميل الملخص ({{error}}).",
    pt: "Não foi possível carregar o resumo ({{error}})."
  }),
  "wallet.summary.winRate": S("Win rate", {
    es: "Win rate",
    fr: "Taux de réussite",
    de: "Trefferquote",
    it: "Win rate",
    ru: "Винрейт",
    zh: "胜率",
    ko: "승률",
    ja: "勝率",
    ar: "معدل الفوز",
    pt: "Taxa de acerto"
  }),
  "wallet.summary.pnl30d": S("30d PnL", {
    es: "PnL 30d",
    fr: "PnL 30j",
    de: "30T PnL",
    it: "PnL 30g",
    ru: "PnL за 30 дн.",
    zh: "30日盈亏",
    ko: "30일 손익",
    ja: "30日PnL",
    ar: "ربح/خسارة 30 يومًا",
    pt: "PnL 30d"
  }),
  "wallet.summary.trades": S("Trades", {
    es: "Trades",
    fr: "Trades",
    de: "Trades",
    it: "Trade",
    ru: "Сделки",
    zh: "成交笔数",
    ko: "거래",
    ja: "取引",
    ar: "صفقات",
    pt: "Trades"
  }),
  "wallet.summary.bestTrade": S("Best trade", {
    es: "Mejor trade",
    fr: "Meilleur trade",
    de: "Bester Trade",
    it: "Miglior trade",
    ru: "Лучшая сделка",
    zh: "最佳交易",
    ko: "최고 거래",
    ja: "最高の取引",
    ar: "أفضل صفقة",
    pt: "Melhor trade"
  }),
  "wallet.summary.lastSeen": S("Last seen", {
    es: "Visto por última vez",
    fr: "Dernière activité",
    de: "Zuletzt gesehen",
    it: "Ultimo avvistamento",
    ru: "Последняя активность",
    zh: "最后出现",
    ko: "마지막 확인",
    ja: "最終確認",
    ar: "آخر ظهور",
    pt: "Última vez visto"
  }),

  "wallet.page.loadingWallet": S("Loading wallet...", {
    es: "Cargando wallet...",
    fr: "Chargement du portefeuille…",
    de: "Wallet wird geladen…",
    it: "Caricamento wallet…",
    ru: "Загрузка кошелька…",
    zh: "正在加载钱包…",
    ko: "지갑 불러오는 중…",
    ja: "ウォレット読み込み中…",
    ar: "جاري تحميل المحفظة…",
    pt: "A carregar carteira…"
  }),
  "wallet.page.invalidAddress": S("Invalid wallet address.", {
    es: "Dirección de wallet no válida.",
    fr: "Adresse de portefeuille invalide.",
    de: "Ungültige Wallet-Adresse.",
    it: "Indirizzo wallet non valido.",
    ru: "Неверный адрес кошелька.",
    zh: "无效的钱包地址。",
    ko: "유효하지 않은 지갑 주소입니다.",
    ja: "無効なウォレットアドレスです。",
    ar: "عنوان محفظة غير صالح.",
    pt: "Endereço de carteira inválido."
  }),
  "wallet.page.profileLabel": S("Wallet profile", {
    es: "Perfil de wallet",
    fr: "Profil portefeuille",
    de: "Wallet-Profil",
    it: "Profilo wallet",
    ru: "Профиль кошелька",
    zh: "钱包档案",
    ko: "지갑 프로필",
    ja: "ウォレットプロフィール",
    ar: "ملف المحفظة",
    pt: "Perfil da carteira"
  }),
  "wallet.page.backToSmartMoney": S("Back to Smart Money", {
    es: "Volver a Smart Money",
    fr: "Retour à Smart Money",
    de: "Zurück zu Smart Money",
    it: "Torna a Smart Money",
    ru: "Назад к Smart Money",
    zh: "返回聪明钱",
    ko: "스마트 머니로 돌아가기",
    ja: "スマートマネーへ戻る",
    ar: "العودة إلى الأموال الذكية",
    pt: "Voltar ao Smart Money"
  }),
  /** Label on link that loads narrative in English */
  "wallet.page.switchNarrativeToEn": S("English", {
    es: "Inglés",
    fr: "Anglais",
    de: "Englisch",
    it: "Inglese",
    ru: "Английский",
    zh: "英语",
    ko: "영어",
    ja: "英語",
    ar: "الإنجليزية",
    pt: "Inglês"
  }),
  /** Label on link that loads narrative in Spanish */
  "wallet.page.switchNarrativeToEs": S("Español", {
    es: "Español",
    fr: "Espagnol",
    de: "Spanisch",
    it: "Spagnolo",
    ru: "Испанский",
    zh: "西班牙语",
    ko: "스페인어",
    ja: "スペイン語",
    ar: "الإسبانية",
    pt: "Espanhol"
  }),
  "wallet.page.whyThisWallet": S("Why this wallet?", {
    es: "¿Por qué esta wallet?",
    fr: "Pourquoi ce portefeuille ?",
    de: "Warum diese Wallet?",
    it: "Perché questo wallet?",
    ru: "Почему этот кошелёк?",
    zh: "为什么是此钱包？",
    ko: "이 지갑이 중요한 이유",
    ja: "このウォレットの理由",
    ar: "لماذا هذه المحفظة؟",
    pt: "Porque esta carteira?"
  })
};
