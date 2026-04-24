/**
 * Flat UI strings: every locale must resolve (non-English falls back to `en` inside S()).
 * Keys use dot notation; looked up by `t()` after nested dictionary miss.
 */

import { WAYFINDING_FLAT_STRINGS } from "./wayfindingFlatStrings";
import { WALLET_FLAT_STRINGS } from "./walletFlatStrings";
import { ALERTS_PAGE_STRINGS } from "./alertsPageStrings";
import { CONTACT_LEGAL_PAGE_STRINGS } from "./contactLegalPageStrings";
import { GRAVEYARD_PAGE_STRINGS } from "./graveyardPageStrings";
import { PRIVACY_TERMS_PAGE_STRINGS } from "./privacyTermsPageStrings";
import { MEDIUM_PAGES_STRINGS } from "./mediumPagesStrings";
import { PRICING_PAGE_STRINGS } from "./pricingPageStrings";
import { STALKER_PAGE_STRINGS } from "./stalkerPageStrings";
import { TOKEN_PAGE_STRINGS } from "./tokenPageStrings";
import { COMPARE_PAGE_STRINGS } from "./comparePageStrings";
import { SMART_MONEY_PAGE_STRINGS } from "./smartMoneyPageStrings";
import { HOME_PAGE_STRINGS } from "./homePageStrings";
import { OPS_PAGE_STRINGS } from "./opsPageStrings";
import { TERMINAL_LEXICON_STRINGS } from "./terminalLexiconStrings";

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
export const FLAT_STRINGS = {
  /* UI chrome label stays English in every locale (product requirement). */
  "layout.language": S("Language"),
  "layout.language_aria": S("Choose interface language", {
    es: "Elegir idioma de la interfaz",
    fr: "Choisir la langue de l’interface",
    de: "Oberflächensprache wählen",
    it: "Scegli la lingua dell’interfaccia",
    ru: "Выберите язык интерфейса",
    zh: "选择界面语言",
    ko: "인터페이스 언어 선택",
    ja: "表示言語を選択",
    ar: "اختر لغة الواجهة",
    pt: "Escolher idioma da interface"
  }),

  "war.header.homeLabel": S("Home", {
    es: "Inicio",
    fr: "Accueil",
    de: "Start",
    it: "Home",
    ru: "Главная",
    zh: "首页",
    ko: "홈",
    ja: "ホーム",
    ar: "الرئيسية",
    pt: "Início",
    nl: "Home",
    pl: "Start",
    tr: "Ana sayfa",
    hi: "होम",
    vi: "Trang chủ"
  }),
  "war.header.tagline": S("Signals on the left · token intel on the right", {
    es: "Señales a la izquierda · análisis del token a la derecha",
    fr: "Signaux à gauche · analyse du jeton à droite",
    de: "Signale links · Token-Intel rechts",
    it: "Segnali a sinistra · intel sul token a destra",
    ru: "Сигналы слева · анализ токена справа",
    zh: "左侧信号 · 右侧代币情报",
    ko: "왼쪽 시그널 · 오른쪽 토큰 인텔",
    ja: "左にシグナル · 右にトークン分析",
    ar: "الإشارات يسارًا · ذكاء الرمز يمينًا",
    pt: "Sinais à esquerda · intel do token à direita"
  }),

  "war.intro.ribbonTitle": S("Solana smart-money tracking", {
    es: "Seguimiento de smart money en Solana",
    fr: "Suivi smart money sur Solana",
    de: "Solana-Smart-Money-Tracking",
    it: "Monitoraggio smart money su Solana",
    ru: "Отслеживание smart money в Solana",
    zh: "Solana 聪明钱追踪",
    ko: "솔라나 스마트 머니 추적",
    ja: "Solana スマートマネー追跡",
    ar: "تتبع أموال الأذكياء على سولانا",
    pt: "Rastreamento de smart money na Solana"
  }),
  "war.intro.ribbonBody": S(
    "One flow: scan signals, open a token, decide. Not financial advice — you own the risk.",
    {
      es: "Un solo flujo: ver señales, abrir un token y decidir. No es asesoramiento financiero: tú priorizas el riesgo.",
      fr: "Un flux : voir les signaux, ouvrir un jeton, décider. Pas un conseil financier — vous portez le risque.",
      de: "Ein Ablauf: Signale sehen, Token öffnen, entscheiden. Keine Finanzberatung — das Risiko tragen Sie.",
      it: "Un flusso: vedere i segnali, aprire un token, decidere. Non è consulenza finanziaria — il rischio è tuo.",
      ru: "Один поток: сигналы, открыть токен, решение. Не финансовый совет — риск на вас.",
      zh: "同一流程：查看信号、打开代币、做决策。非投资建议——风险由您承担。",
      ko: "한 흐름: 시그널 확인, 토큰 열기, 판단. 투자 조언이 아닙니다 — 리스크는 본인에게 있습니다.",
      ja: "一つの流れ：シグナルを見る、トークンを開く、判断する。金融アドバイスではありません — リスクはあなた次第です。",
      ar: "تدفق واحد: رؤية الإشارات، فتح الرمز، اتخاذ القرار. ليس نصيحة مالية — المخاطرة على عاتقك.",
      pt: "Um fluxo: ver sinais, abrir um token, decidir. Não é aconselhamento financeiro — o risco é seu."
    }
  ),
  "war.intro.strategyHint": S("Tightens decision hints. Sound is optional.", {
    es: "Ajusta cómo de estricta es la sugerencia. Sonido solo avisa; no es obligatorio.",
    fr: "Resserre les suggestions. Le son est facultatif.",
    de: "Stellt die Strenge der Hinweise ein. Ton ist optional.",
    it: "Rende più rigidi i suggerimenti. L’audio è facoltativo.",
    ru: "Ужесточает подсказки. Звук необязателен.",
    zh: "收紧决策提示。声音可选。",
    ko: "결정 힌트를 더 엄격하게. 소리는 선택 사항입니다.",
    ja: "判断ヒントを厳しく。音は任意です。",
    ar: "يشدد تلميحات القرار. الصوت اختياري.",
    pt: "Endurece as dicas de decisão. Som é opcional."
  }),
  "war.intro.strategy.conservative": S("Conservative", { es: "Prudente", fr: "Prudent", de: "Konservativ", it: "Prudente", ru: "Осторожный", zh: "保守", ko: "보수", ja: "慎重", ar: "محافظ", pt: "Conservador" }),
  "war.intro.strategy.balanced": S("Balanced", { es: "Equilibrado", fr: "Équilibré", de: "Ausgewogen", it: "Equilibrato", ru: "Сбалансированный", zh: "平衡", ko: "균형", ja: "バランス", ar: "متوازن", pt: "Equilibrado" }),
  "war.intro.strategy.aggressive": S("Aggressive", { es: "Más riesgo", fr: "Agressif", de: "Aggressiv", it: "Aggressivo", ru: "Агрессивный", zh: "进取", ko: "공격적", ja: "積極的", ar: "عدواني", pt: "Agressivo" }),
  "war.intro.soundOn": S("Sound", { es: "Sonido", fr: "Son", de: "Ton", it: "Suono", ru: "Звук", zh: "声音", ko: "소리", ja: "音", ar: "صوت", pt: "Som" }),
  "war.intro.soundOff": S("Mute", { es: "Silencio", fr: "Muet", de: "Stumm", it: "Muto", ru: "Без звука", zh: "静音", ko: "음소거", ja: "ミュート", ar: "كتم", pt: "Silêncio" }),

  "war.tactical.aria": S("Tactical feed", { es: "Feed táctico", fr: "Flux tactique", de: "Taktisches Feed", it: "Feed tattico", ru: "Тактическая лента", zh: "战术信息流", ko: "전술 피드", ja: "戦術フィード", ar: "التدفق التكتيكي", pt: "Feed tático" }),
  "war.tactical.tabLive": S("LIVE"),
  "war.tactical.tabHot": S("HOT"),
  "war.tactical.tabHistory": S("HISTORY", { es: "HISTORIAL", fr: "HISTORIQUE", de: "VERLAUF", it: "CRONOLOGIA", ru: "ИСТОРИЯ", zh: "历史", ko: "기록", ja: "履歴", ar: "السجل", pt: "HISTÓRICO" }),

  "war.live.decisionMarketOnly": S("Market only", {
    es: "Solo mercado",
    fr: "Marché seulement",
    de: "Nur Markt",
    it: "Solo mercato",
    ru: "Только рынок",
    zh: "仅市场",
    ko: "시장만",
    ja: "市場のみ",
    ar: "السوق فقط",
    pt: "Somente mercado"
  }),
  "war.live.badgeHeat": S("Heat"),
  "war.live.badgeSignal": S("Signal", { es: "Señal", fr: "Signal", de: "Signal", it: "Segnale", ru: "Сигнал", zh: "信号", ko: "시그널", ja: "シグナル", ar: "إشارة", pt: "Sinal" }),
  "war.live.titleHintHeat": S("Click: open on desk (?t=) · Heat data", {
    es: "Clic: ver en el desk (?t=) · datos Heat",
    fr: "Clic : ouvrir sur le desk (?t=) · données Heat",
    de: "Klick: im Desk (?t=) · Heat-Daten",
    it: "Clic: apri sul desk (?t=) · dati Heat",
    ru: "Клик: открыть в desk (?t=) · данные Heat",
    zh: "点击：在 desk 打开 (?t=) · Heat 数据",
    ko: "클릭: 데스크에서 열기 (?t=) · Heat 데이터",
    ja: "クリック: デスクで表示 (?t=) · Heat データ",
    ar: "انقر: فتح في المكتب (?t=) · بيانات Heat",
    pt: "Clique: abrir no desk (?t=) · dados Heat"
  }),
  "war.live.titleHintDb": S("Click: open on desk (?t=) · DB signal", {
    es: "Clic: ver en el desk (?t=) · señal DB",
    fr: "Clic : ouvrir sur le desk (?t=) · signal DB",
    de: "Klick: im Desk (?t=) · DB-Signal",
    it: "Clic: apri sul desk (?t=) · segnale DB",
    ru: "Клик: открыть в desk (?t=) · сигнал БД",
    zh: "点击：在 desk 打开 (?t=) · 数据库信号",
    ko: "클릭: 데스크에서 열기 (?t=) · DB 시그널",
    ja: "クリック: デスクで表示 (?t=) · DBシグナル",
    ar: "انقر: فتح في المكتب (?t=) · إشارة قاعدة البيانات",
    pt: "Clique: abrir no desk (?t=) · sinal DB"
  }),
  "war.live.metricsMarket": S("Metrics (market)", { es: "Métricas (mercado)", fr: "Indicateurs (marché)", de: "Kennzahlen (Markt)", it: "Metriche (mercato)", ru: "Метрики (рынок)", zh: "指标（市场）", ko: "지표(시장)", ja: "指標（市場）", ar: "المقاييس (السوق)", pt: "Métricas (mercado)" }),
  "war.live.whyNow": S("Why now", { es: "Por qué ahora", fr: "Pourquoi maintenant", de: "Warum jetzt", it: "Perché ora", ru: "Почему сейчас", zh: "为何此时", ko: "지금인 이유", ja: "なぜ今", ar: "لماذا الآن", pt: "Por que agora" }),
  "war.live.heatNoEntry": S("No DB entry window: rank follows Heat only (score above).", {
    es: "Sin ventana de entrada desde DB: posición solo por ranking Heat (score arriba).",
    fr: "Pas de fenêtre d’entrée DB : le rang suit uniquement le Heat.",
    de: "Kein DB-Einstiegsfenster: Rang nur nach Heat.",
    it: "Nessuna finestra DB: il rango segue solo Heat.",
    ru: "Нет окна входа из БД: ранг только по Heat.",
    zh: "无数据库入场窗口：排名仅按 Heat。",
    ko: "DB 진입 창 없음: Heat 순위만 반영.",
    ja: "DBのエントリー窓なし: Heat順位のみ。",
    ar: "لا نافذة دخول من قاعدة البيانات: الترتيب حسب Heat فقط.",
    pt: "Sem janela de entrada da DB: ranking só pelo Heat."
  }),
  "war.live.decisionFeedLabel": S("Decision feed", { es: "Feed de decisiones", fr: "Fil des décisions", de: "Entscheidungs-Feed", it: "Feed decisioni", ru: "Лента решений", zh: "决策信息流", ko: "결정 피드", ja: "意思決定フィード", ar: "تدفق القرارات", pt: "Feed de decisões" }),
  "war.live.liveTitle": S("Live Smart Money"),
  "war.live.expandAria": S("Expand grid", { es: "Ampliar cuadrícula", fr: "Agrandir la grille", de: "Raster vergrößern", it: "Espandi griglia", ru: "Развернуть сетку", zh: "展开网格", ko: "그리드 확장", ja: "グリッドを広げる", ar: "توسيع الشبكة", pt: "Expandir grade" }),
  "war.live.collapseAria": S("Collapse grid", { es: "Contraer cuadrícula", fr: "Réduire la grille", de: "Raster einklappen", it: "Comprimi griglia", ru: "Свернуть сетку", zh: "收起网格", ko: "그리드 접기", ja: "グリッドを畳む", ar: "طي الشبكة", pt: "Recolher grade" }),
  "war.live.expandTitle": S("Expand feed", { es: "Ampliar feed", fr: "Agrandir le flux", de: "Feed vergrößern", it: "Espandi feed", ru: "Развернуть ленту", zh: "展开信息流", ko: "피드 확장", ja: "フィードを広げる", ar: "توسيع التدفق", pt: "Expandir feed" }),
  "war.live.collapseTitle": S("Collapse feed", { es: "Contraer", fr: "Réduire", de: "Einklappen", it: "Comprimi", ru: "Свернуть", zh: "收起", ko: "접기", ja: "畳む", ar: "طي", pt: "Recolher" }),
  "war.live.poolLine": S(
    "{{db}} DB signals · {{heat}} heat · score ↓ · {{vis}} visible · pool {{pool}}",
    { es: "{{db}} señales base · {{heat}} heat · orden score ↓ · {{vis}} vis · pool {{pool}}" }
  ),
  "war.live.walletActivity": S("Wallet activity", { es: "Actividad de wallets", fr: "Activité des wallets", de: "Wallet-Aktivität", it: "Attività wallet", ru: "Активность кошельков", zh: "钱包动态", ko: "지갑 활동", ja: "ウォレット活動", ar: "نشاط المحافظ", pt: "Atividade de wallets" }),
  "war.live.statusDegraded": S("Degraded", { es: "Degradado", fr: "Dégradé", de: "Eingeschränkt", it: "Degradato", ru: "Ограничено", zh: "降级", ko: "저하", ja: "劣化", ar: "مخفض", pt: "Degradado" }),
  "war.live.statusLive": S("Live", { es: "En vivo", fr: "En direct", de: "Live", it: "Live", ru: "Онлайн", zh: "实时", ko: "라이브", ja: "ライブ", ar: "مباشر", pt: "Ao vivo" }),
  "war.live.syncing": S("syncing…", { es: "sincronizando…", fr: "synchronisation…", de: "Synchronisiere…", it: "sincronizzo…", ru: "синхронизация…", zh: "同步中…", ko: "동기화 중…", ja: "同期中…", ar: "مزامنة…", pt: "sincronizando…" }),
  "war.live.justNow": S("just now", { es: "ahora", fr: "à l’instant", de: "gerade", it: "adesso", ru: "сейчас", zh: "刚刚", ko: "방금", ja: "たった今", ar: "الآن", pt: "agora" }),
  "war.live.secondsAgo": S("{{sec}}s ago", { es: "hace {{sec}}s", fr: "il y a {{sec}} s", de: "vor {{sec}} s", it: "{{sec}} s fa", ru: "{{sec}} с назад", zh: "{{sec}}秒前", ko: "{{sec}}초 전", ja: "{{sec}}秒前", ar: "منذ {{sec}} ث", pt: "há {{sec}}s" }),
  "war.live.pollWar": S("every 5s", { es: "cada 5s", fr: "toutes les 5 s", de: "alle 5 s", it: "ogni 5 s", ru: "каждые 5 с", zh: "每 5 秒", ko: "5초마다", ja: "5秒ごと", ar: "كل 5 ث", pt: "a cada 5s" }),
  "war.live.pollNormal": S("every 15s", { es: "cada 15s", fr: "toutes les 15 s", de: "alle 15 s", it: "ogni 15 s", ru: "каждые 15 с", zh: "每 15 秒", ko: "15초마다", ja: "15秒ごと", ar: "كل 15 ث", pt: "a cada 15s" }),
  "war.live.empty.loadingTitle": S("Loading feed…", { es: "Cargando feed…", fr: "Chargement du flux…", de: "Feed wird geladen…", it: "Caricamento feed…", ru: "Загрузка ленты…", zh: "正在加载信息流…", ko: "피드 로딩 중…", ja: "フィード読み込み中…", ar: "جارٍ تحميل التدفق…", pt: "Carregando feed…" }),
  "war.live.empty.loadingBody": S("Signals and ranking are on the way.", {
    es: "Un momento: señales y ranking en camino.",
    fr: "Signaux et classement arrivent.",
    de: "Signale und Ranking folgen.",
    it: "Segnali e ranking in arrivo.",
    ru: "Сигналы и рейтинг загружаются.",
    zh: "信号与排名即将就绪。",
    ko: "시그널과 랭킹을 불러오는 중입니다.",
    ja: "シグナルとランキングを読み込み中です。",
    ar: "الإشارات والتصنيف قادمان.",
    pt: "Sinais e ranking a caminho."
  }),
  "war.live.empty.errorTitle": S("Signal connection limited", {
    es: "Conexión con señales limitada",
    fr: "Connexion aux signaux limitée",
    de: "Signalverbindung eingeschränkt",
    it: "Connessione ai segnali limitata",
    ru: "Ограниченное подключение к сигналам",
    zh: "信号连接受限",
    ko: "시그널 연결 제한",
    ja: "シグナル接続が制限されています",
    ar: "اتصال الإشارات محدود",
    pt: "Conexão de sinais limitada"
  }),
  "war.live.empty.errorBody": S("Check /api/v1/signals/latest and Supabase. Heat cards may return once the API responds.", {
    es: "Revisa /api/v1/signals/latest y Supabase. Si Heat sigue activo, las cartas pueden volver en cuanto la API responda.",
    fr: "Vérifiez /api/v1/signals/latest et Supabase. Les cartes Heat peuvent revenir quand l’API répond.",
    de: "Prüfen Sie /api/v1/signals/latest und Supabase. Heat-Karten können zurückkehren, sobald die API antwortet.",
    it: "Controlla /api/v1/signals/latest e Supabase. Le schede Heat possono tornare quando l’API risponde.",
    ru: "Проверьте /api/v1/signals/latest и Supabase. Карточки Heat могут вернуться после ответа API.",
    zh: "检查 /api/v1/signals/latest 与 Supabase。API 恢复后 Heat 卡片可能重现。",
    ko: "/api/v1/signals/latest와 Supabase를 확인하세요. API가 응답하면 Heat 카드가 돌아올 수 있습니다.",
    ja: "/api/v1/signals/latest と Supabase を確認してください。API が応答すれば Heat カードが戻ることがあります。",
    ar: "تحقق من ‎/api/v1/signals/latest‎ وSupabase. قد تعود بطاقات Heat عند استجابة الـ API.",
    pt: "Verifique /api/v1/signals/latest e Supabase. Os cartões Heat podem voltar quando a API responder."
  }),
  "war.live.empty.inboxTitle": S("Nothing on screen yet", {
    es: "Aún sin datos en pantalla",
    fr: "Rien à l’écran pour l’instant",
    de: "Noch nichts auf dem Bildschirm",
    it: "Ancora nulla a schermo",
    ru: "Пока пусто на экране",
    zh: "屏幕上暂无数据",
    ko: "아직 화면에 데이터 없음",
    ja: "まだ画面にデータがありません",
    ar: "لا شيء على الشاشة بعد",
    pt: "Ainda nada na tela"
  }),
  "war.live.empty.inboxBody": S("When signals or Heat load, DB signals appear first (best score on top), then market fills without duplicate mints.", {
    es: "Cuando haya señales o Heat, verás primero las de base de datos (mejor score arriba) y después el mercado, sin repetir mints.",
    fr: "Quand les signaux ou le Heat arrivent, les signaux DB d’abord (meilleur score en haut), puis le marché sans doublons de mints.",
    de: "Wenn Signale oder Heat geladen sind, zuerst DB-Signale (bester Score oben), dann Markt ohne doppelte Mints.",
    it: "Con segnali o Heat, prima i segnali DB (miglior score in alto), poi il mercato senza mint duplicati.",
    ru: "Когда появятся сигналы или Heat, сначала сигналы БД (лучший score сверху), затем рынок без дубликатов mint.",
    zh: "有信号或 Heat 时，先显示数据库信号（高分在上），再补市场且不重复 mint。",
    ko: "시그널이나 Heat가 로드되면 DB 시그널이 먼저(높은 점수 위), 이어 시장이 중복 mint 없이 채워집니다.",
    ja: "シグナルまたは Heat が載ると、まずDBシグナル（高スコアが上）、続いて重複mintなしで市場が埋まります。",
    ar: "عند توفر الإشارات أو Heat، تظهر إشارات قاعدة البيانات أولاً (أفضل درجة في الأعلى) ثم السوق دون تكرار الـ mints.",
    pt: "Quando houver sinais ou Heat, primeiro os da DB (melhor score no topo), depois o mercado sem mints duplicados."
  }),

  "war.live.confidence.strong": S("STRONG CONVICTION", { es: "CONFIANZA ALTA", fr: "FORTE CONVICTION", de: "STARKE ÜBERZEUGUNG", it: "FORTE CONVINZIONE", ru: "СИЛЬНАЯ УВЕРЕННОСТЬ", zh: "强确信", ko: "강한 확신", ja: "強い確信", ar: "قناعة قوية", pt: "FORTE CONVICÇÃO" }),
  "war.live.confidence.build": S("BUILD POSITION", { es: "CONSTRUIR POSICIÓN", fr: "CONSTRUIRE LA POSITION", de: "POSITION AUFBAUEN", it: "COSTRUIRE POSIZIONE", ru: "НАБИРАТЬ ПОЗИЦИЮ", zh: "建仓", ko: "포지션 구축", ja: "ポジション構築", ar: "بناء مركز", pt: "MONTAR POSIÇÃO" }),
  "war.live.confidence.low": S("LOW EDGE", { es: "POCO EDGE", fr: "FAIBLE AVANTAGE", de: "GERINGE EDGE", it: "SCARSO VANTAGGIO", ru: "СЛАБОЕ ПРЕИМУЩЕСТВО", zh: "优势偏低", ko: "낮은 엣지", ja: "エッジ低め", ar: "أفضلية ضعيفة", pt: "POUCA VANTAGEM" }),

  "war.hot.label": S("Hot Tokens"),
  "war.hot.sub": S("Live ranking by API score: best token on top. Real metrics, swap and terminal in one click.", {
    es: "Ranking en vivo por score del API: mejor token arriba. Métricas reales, swap y ficha en un clic.",
    fr: "Classement live par score API : meilleur jeton en haut. Métriques réelles, swap et fiche en un clic.",
    de: "Live-Ranking nach API-Score: bestes Token oben. Echte Kennzahlen, Swap und Terminal mit einem Klick.",
    it: "Ranking live per score API: miglior token in cima. Metriche reali, swap e scheda in un clic.",
    ru: "Живой рейтинг по score API: лучший токен сверху. Реальные метрики, своп и терминал в один клик.",
    zh: "按 API 分数实时排名：最优代币在上。真实指标、交换与终端一键可达。",
    ko: "API 점수 기준 실시간 랭킹: 최상위 토큰이 위. 실제 지표, 스왑과 터미널을 한 번에.",
    ja: "APIスコアのライブランキング: 最上位が上。実メトリクス、スワップとターミナルをワンクリック。",
    ar: "ترتيب مباشر حسب درجة واجهة API: أفضل رمز في الأعلى. مقاييس حقيقية، المبادلة والواجهة بنقرة.",
    pt: "Ranking ao vivo por score da API: melhor token no topo. Métricas reais, swap e terminal em um clique."
  }),
  "war.hot.visLine": S("{{vis}} visible · {{pool}} ranked", { es: "{{vis}} vis · {{pool}} ranked" }),
  "war.hot.feedSnapshot": S("SNAPSHOT"),
  "war.hot.feedLive": S("LIVE"),
  "war.hot.feedDegraded": S("LIVE · DEGRADED"),
  "war.hot.recently": S("just now", { es: "recién", fr: "à l’instant", de: "gerade", it: "ora", ru: "сейчас", zh: "刚刚", ko: "방금", ja: "今", ar: "الآن", pt: "agora" }),
  "war.hot.pollHotWar": S("every 5s", { es: "cada 5s" }),
  "war.hot.pollHotNormal": S("every 25s", { es: "cada 25s" }),
  "war.hot.minLiq": S("min liq", { es: "liq min" }),
  "war.hot.clickDesk": S("Click to open on desk (?t=)", {
    es: "Clic: ver en el desk (?t=)",
    fr: "Clic : ouvrir sur le desk (?t=)",
    de: "Klick: im Desk öffnen (?t=)",
    it: "Clic: apri sul desk (?t=)",
    ru: "Клик: открыть в desk (?t=)",
    zh: "点击在 desk 打开 (?t=)",
    ko: "클릭하여 데스크에서 열기 (?t=)",
    ja: "クリックでデスクに表示 (?t=)",
    ar: "انقر للفتح في المكتب (?t=)",
    pt: "Clique para abrir no desk (?t=)"
  }),

  "war.live.decision.enter": S("ENTER NOW", { es: "ENTRAR YA", fr: "ENTRER", de: "JETZT EINSTEIGEN", it: "ENTRA ORA", ru: "ВХОД СЕЙЧАС", zh: "立即进入", ko: "지금 진입", ja: "今すぐエントリー", ar: "ادخل الآن", pt: "ENTRAR AGORA" }),
  "war.live.decision.prepare": S("PREPARE", { es: "PREPARAR", fr: "PRÉPARER", de: "VORBEREITEN", it: "PREPARATI", ru: "ПОДГОТОВКА", zh: "准备", ko: "준비", ja: "準備", ar: "استعد", pt: "PREPARAR" }),
  "war.live.decision.stayout": S("STAY OUT", { es: "NO ENTRAR", fr: "RESTEZ DEHORS", de: "DRAUßEN BLEIBEN", it: "RESTA FUORI", ru: "ВНЕ", zh: "观望", ko: "참여 안 함", ja: "見送り", ar: "لا تدخل", pt: "FICAR DE FORA" }),

  "war.combat.walletFollow": S("FOLLOW", { es: "SEGUIR", fr: "SUIVRE", de: "FOLGEN", it: "SEGUI", ru: "СЛЕДОВАТЬ", zh: "跟随", ko: "팔로우", ja: "フォロー", ar: "تابع", pt: "SEGUIR" }),
  "war.combat.walletMonitor": S("MONITOR", { es: "MONITORIZAR", fr: "SURVEILLER", de: "MONITOR", it: "MONITORA", ru: "МОНИТОР", zh: "监控", ko: "모니터", ja: "監視", ar: "راقب", pt: "MONITORAR" }),
  "war.combat.walletIgnore": S("IGNORE", { es: "IGNORAR", fr: "IGNORER", de: "IGNORIEREN", it: "IGNORA", ru: "ИГНОР", zh: "忽略", ko: "무시", ja: "無視", ar: "تجاهل", pt: "IGNORAR" }),

  "war.combat.bestHighlight": S("Latest highlighted outcome", { es: "Último resultado resaltado", fr: "Dernier résultat mis en avant", de: "Letztes hervorgehobenes Ergebnis", it: "Ultimo esito in evidenza", ru: "Последний выделенный исход", zh: "最新突出结果", ko: "최근 강조 결과", ja: "最新のハイライト結果", ar: "أحدث نتيجة بارزة", pt: "Último resultado em destaque" }),
  "war.combat.openToken": S("Open token", { es: "Abrir ficha", fr: "Ouvrir la fiche", de: "Token öffnen", it: "Apri token", ru: "Открыть токен", zh: "打开代币页", ko: "토큰 열기", ja: "トークンを開く", ar: "فتح الرمز", pt: "Abrir token" }),
  "war.combat.scoreApprox": S("Score ~{{score}}", { es: "Puntuación ~{{score}}" }),
  "war.combat.noRecent": S("No recent closed outcomes to show.", {
    es: "Sin resultados cerrados recientes para mostrar.",
    fr: "Aucun résultat clôturé récent à afficher.",
    de: "Keine kürzlich geschlossenen Ergebnisse.",
    it: "Nessun esito chiuso recente da mostrare.",
    ru: "Нет недавних закрытых исходов.",
    zh: "暂无近期已关闭结果。",
    ko: "표시할 최근 종료 결과가 없습니다.",
    ja: "表示する最近の確定結果がありません。",
    ar: "لا توجد نتائج مغلقة حديثة للعرض.",
    pt: "Sem resultados fechados recentes para exibir."
  }),
  "war.combat.summary7d": S("Last 7 days (closed signals)", { es: "Últimos 7 días (señales cerradas)", fr: "7 derniers jours (signaux clôturés)", de: "Letzte 7 Tage (geschlossene Signale)", it: "Ultimi 7 giorni (segnali chiusi)", ru: "Последние 7 дней (закрытые сигналы)", zh: "过去 7 天（已关闭信号）", ko: "최근 7일(종료된 시그널)", ja: "過去7日（クローズ済シグナル）", ar: "آخر 7 أيام (إشارات مغلقة)", pt: "Últimos 7 dias (sinais fechados)" }),
  "war.combat.hitSummaryTitle": S("Hit summary", { es: "Resumen de aciertos", fr: "Synthèse des hits", de: "Trefferübersicht", it: "Riepilogo hit", ru: "Сводка попаданий", zh: "命中摘要", ko: "적중 요약", ja: "ヒット概要", ar: "ملخص الإصابات", pt: "Resumo de acertos" }),
  "war.combat.winsLosses": S("Wins {{w}} · Losses {{l}}{{pend}}", {
    es: "Aciertos {{w}} · No aciertos {{l}}{{pend}}"
  }),
  "war.combat.pendingSuffix": S(" · Pending {{p}}", { es: " · En curso {{p}}" }),
  "war.combat.avgs": S("Averages: {{aw}} winner / {{al}} loser", {
    es: "Medias: {{aw}} ganador / {{al}} perdedor"
  }),
  "war.combat.net": S("Net return: {{n}}", { es: "Retorno neto: {{n}}" }),
  "war.combat.summaryLoading": S("Loading data or no history yet. Real numbers depend on your API.", {
    es: "Cargando datos o sin historial aún. Los números reales dependen de tu API.",
    fr: "Chargement ou pas d’historique encore. Les chiffres réels dépendent de votre API.",
    de: "Daten werden geladen oder noch kein Verlauf. Echte Zahlen hängen von Ihrer API ab.",
    it: "Caricamento o nessuna cronologia ancora. I numeri reali dipendono dalla tua API.",
    ru: "Загрузка или истории ещё нет. Реальные цифры зависят от вашего API.",
    zh: "正在加载或尚无历史。实际数字取决于您的 API。",
    ko: "데이터 로딩 중이거나 아직 기록이 없습니다. 실제 수치는 API에 따릅니다.",
    ja: "読み込み中、または履歴がありません。実数値はAPIに依存します。",
    ar: "جارٍ التحميل أو لا يوجد سجل بعد. الأرقام الفعلية تعتمد على واجهة API.",
    pt: "Carregando dados ou sem histórico ainda. Os números reais dependem da sua API."
  }),
  "war.combat.walletsTitle": S("Top-scoring wallets", { es: "Carteras con mejor puntuación", fr: "Portefeuilles au meilleur score", de: "Wallets mit bestem Score", it: "Wallet con punteggio migliore", ru: "Кошельки с лучшим счётом", zh: "得分最高的钱包", ko: "최고 점수 지갑", ja: "最高スコアのウォレット", ar: "المحافظ الأعلى نقاطًا", pt: "Carteiras com melhor pontuação" }),
  "war.combat.walletsMeta": S("{{n}} rows · tap row for details ·", { es: "{{n}} filas · toca la fila para detalles ·" }),
  "war.combat.fullRanking": S("Full ranking", { es: "Ver ranking completo", fr: "Classement complet", de: "Vollständiges Ranking", it: "Ranking completo", ru: "Полный рейтинг", zh: "完整排名", ko: "전체 랭킹", ja: "全ランキング", ar: "التصنيف الكامل", pt: "Ranking completo" }),
  "war.combat.serverDataTitle": S("Server data", { es: "Datos de servidor", fr: "Données serveur", de: "Serverdaten", it: "Dati server", ru: "Данные сервера", zh: "服务器数据", ko: "서버 데이터", ja: "サーバーデータ", ar: "بيانات الخادم", pt: "Dados do servidor" }),
  "war.combat.noApiTitle": S("No API data", { es: "Sin datos en API", fr: "Pas de données API", de: "Keine API-Daten", it: "Nessun dato API", ru: "Нет данных API", zh: "无 API 数据", ko: "API 데이터 없음", ja: "APIデータなし", ar: "لا بيانات للـ API", pt: "Sem dados da API" }),
  "war.combat.liveData": S("Live data", { es: "Datos en vivo", fr: "Données live", de: "Live-Daten", it: "Dati live", ru: "Живые данные", zh: "实时数据", ko: "라이브 데이터", ja: "ライブデータ", ar: "بيانات مباشرة", pt: "Dados ao vivo" }),
  "war.combat.noDataShort": S("No data", { es: "Sin datos", fr: "Aucune donnée", de: "Keine Daten", it: "Nessun dato", ru: "Нет данных", zh: "无数据", ko: "데이터 없음", ja: "データなし", ar: "لا بيانات", pt: "Sem dados" }),
  "war.combat.thWallet": S("Wallet", { es: "Cartera", fr: "Portefeuille", de: "Wallet", it: "Wallet", ru: "Кошелёк", zh: "钱包", ko: "지갑", ja: "ウォレット", ar: "محفظة", pt: "Carteira" }),
  "war.combat.thWin": S("Win"),
  "war.combat.thEntry": S("Entry", { es: "Entrada", fr: "Entrée", de: "Einstieg", it: "Ingresso", ru: "Вход", zh: "入场", ko: "진입", ja: "エントリー", ar: "الدخول", pt: "Entrada" }),
  "war.combat.thCluster": S("Cluster", { es: "Agrup.", fr: "Cluster", de: "Cluster", it: "Cluster", ru: "Кластер", zh: "集群", ko: "클러스터", ja: "クラスタ", ar: "عنقود", pt: "Cluster" }),
  "war.combat.thConsistency": S("Consistency", { es: "Const.", fr: "Régularité", de: "Konstanz", it: "Costanza", ru: "Стабильность", zh: "稳定性", ko: "일관성", ja: "一貫性", ar: "الاتساق", pt: "Consistência" }),
  "war.combat.thScore": S("Score", { es: "Puntuac.", fr: "Score", de: "Score", it: "Punteggio", ru: "Счёт", zh: "分数", ko: "점수", ja: "スコア", ar: "الدرجة", pt: "Pontuação" }),
  "war.combat.thConfidence": S("Confidence", { es: "Confianza", fr: "Confiance", de: "Vertrauen", it: "Confidenza", ru: "Уверенность", zh: "信心", ko: "신뢰도", ja: "信頼度", ar: "الثقة", pt: "Confiança" }),
  "war.combat.thIdea": S("Idea"),
  "war.combat.th30d": S("30d $"),
  "war.combat.detail": S("Detail", { es: "Detalle", fr: "Détail", de: "Detail", it: "Dettaglio", ru: "Детали", zh: "详情", ko: "상세", ja: "詳細", ar: "التفاصيل", pt: "Detalhe" }),
  "war.combat.walletSheet": S("Wallet profile", { es: "Ficha wallet", fr: "Fiche wallet", de: "Wallet-Profil", it: "Profilo wallet", ru: "Профиль кошелька", zh: "钱包档案", ko: "지갑 프로필", ja: "ウォレットプロフィール", ar: "ملف المحفظة", pt: "Perfil da wallet" }),
  "war.combat.top50": S("Top 50 leaderboard"),
  "war.combat.yourStatus": S("Your status", { es: "Tu estado", fr: "Votre statut", de: "Ihr Status", it: "Il tuo stato", ru: "Ваш статус", zh: "您的状态", ko: "내 상태", ja: "あなたの状態", ar: "حالتك", pt: "Seu status" }),
  "war.combat.loggedIn": S("Session active. Personalized recommendations will appear when the profile endpoint is enabled.", {
    es: "Sesión activa. Las recomendaciones personalizadas aparecerán cuando el endpoint de perfil esté habilitado.",
    fr: "Session active. Les recommandations personnalisées apparaîtront quand le point de terminaison profil sera activé.",
    de: "Sitzung aktiv. Personalisierte Empfehlungen erscheinen, sobald der Profil-Endpunkt aktiv ist.",
    it: "Sessione attiva. I consigli personalizzati compariranno quando l’endpoint profilo sarà attivo.",
    ru: "Сессия активна. Персональные рекомендации появятся, когда будет включён endpoint профиля.",
    zh: "会话已激活。启用个人资料端点后将显示个性化建议。",
    ko: "세션 활성. 프로필 엔드포인트가 켜지면 맞춤 추천이 표시됩니다.",
    ja: "セッション有効。プロフィールAPIが有効になるとパーソナライズが表示されます。",
    ar: "الجلسة نشطة. ستظهر التوصيات المخصصة عند تفعيل نقطة نهاية الملف الشخصي.",
    pt: "Sessão ativa. Recomendações personalizadas aparecerão quando o endpoint de perfil estiver ativo."
  }),
  "war.combat.loggedOut": S("Connect a wallet to enable personal context when the API supports it.", {
    es: "Conecta cartera para habilitar contexto personal cuando esté disponible en API.",
    fr: "Connectez un portefeuille pour activer le contexte personnel quand l’API le permet.",
    de: "Wallet verbinden für persönlichen Kontext, sobald die API es unterstützt.",
    it: "Collega un wallet per il contesto personale quando l’API lo consente.",
    ru: "Подключите кошелёк для персонального контекста, когда API это поддержит.",
    zh: "连接钱包以在 API 支持时启用个人上下文。",
    ko: "API가 지원하면 지갑을 연결해 개인 맥락을 켜세요.",
    ja: "API対応時にウォレットを接続して個人コンテキストを有効に。",
    ar: "اربط محفظة لتفعيل السياق الشخصي عندما تدعمه واجهة API.",
    pt: "Conecte uma carteira para contexto pessoal quando a API suportar."
  }),
  "war.combat.riskTitle": S("Alerts for the focused signal (heuristic)", {
    es: "Avisos sobre la señal en foco (heurístico)",
    fr: "Alertes sur le signal focalisé (heuristique)",
    de: "Hinweise zum fokussierten Signal (heuristisch)",
    it: "Avvisi sul segnale in focus (euristico)",
    ru: "Предупреждения по текущему сигналу (эвристика)",
    zh: "当前信号提示（启发式）",
    ko: "포커스 시그널 경고(휴리스틱)",
    ja: "フォーカス中シグナルへの注意（ヒューリスティック）",
    ar: "تنبيهات للإشارة المركزة (استدلالي)",
    pt: "Alertas sobre o sinal em foco (heurístico)"
  }),
  "war.combat.riskEmpty": S("No extra alerts on this signal. Keep checking liquidity and contract on the token page.", {
    es: "Sin alertas extra en esta señal. Sigue comprobando liquidez y contrato en la ficha del token.",
    fr: "Pas d’alerte supplémentaire sur ce signal. Vérifiez liquidité et contrat sur la page token.",
    de: "Keine weiteren Alerts zu diesem Signal. Prüfen Sie Liquidität und Vertrag auf der Token-Seite.",
    it: "Nessun alert extra su questo segnale. Continua a controllare liquidità e contratto sulla pagina token.",
    ru: "Дополнительных предупреждений по сигналу нет. Проверяйте ликвидность и контракт на странице токена.",
    zh: "此信号无额外提醒。请在代币页继续核对流动性与合约。",
    ko: "이 시그널에 추가 경고 없음. 토큰 페이지에서 유동성과 컨트랙트를 계속 확인하세요.",
    ja: "このシグナルに追加アラートはありません。トークンページで流動性とコントラクトを確認してください。",
    ar: "لا تنبيهات إضافية لهذه الإشارة. تابع فحص السيولة والعقد في صفحة الرمز.",
    pt: "Sem alertas extras neste sinal. Continue checando liquidez e contrato na página do token."
  }),
  "war.combat.heatTrend": S("Trend (approx. heat):", { es: "Tendencia (heat aprox.):", fr: "Tendance (heat approx.) :", de: "Trend (ca. Heat):", it: "Tendenza (heat appross.):", ru: "Тренд (прибл. heat):", zh: "趋势（约 heat）:", ko: "추세(근사 heat):", ja: "トレンド（近似 heat）:", ar: "الاتجاه (تقريب heat):", pt: "Tendência (heat aprox.):" }),
  "war.combat.compareTitle": S("Compare two tokens", { es: "Comparar dos tokens", fr: "Comparer deux jetons", de: "Zwei Token vergleichen", it: "Confronta due token", ru: "Сравнить два токена", zh: "对比两个代币", ko: "두 토큰 비교", ja: "2つのトークンを比較", ar: "مقارنة رمزين", pt: "Comparar dois tokens" }),
  "war.combat.compareSub": S("Same summary, side by side (liquidity, grade, risk).", {
    es: "Mismo resumen, lado a lado (liquidez, nota, riesgo).",
    fr: "Même résumé, côte à côte (liquidité, note, risque).",
    de: "Gleiche Übersicht, nebeneinander (Liquidität, Note, Risiko).",
    it: "Stesso riepilogo, affiancato (liquidità, voto, rischio).",
    ru: "Тот же обзор, рядом (ликвидность, оценка, риск).",
    zh: "相同摘要并排（流动性、评级、风险）。",
    ko: "동일 요약을 나란히(유동성, 등급, 리스크).",
    ja: "同じ要約を並べて（流動性、グレード、リスク）。",
    ar: "نفس الملخص جنبًا إلى جنب (السيولة، الدرجة، المخاطر).",
    pt: "Mesmo resumo, lado a lado (liquidez, nota, risco)."
  }),
  "war.combat.compareCta": S("Open compare", { es: "Abrir comparador", fr: "Ouvrir le comparateur", de: "Vergleich öffnen", it: "Apri confronto", ru: "Открыть сравнение", zh: "打开对比", ko: "비교 열기", ja: "比較を開く", ar: "فتح المقارنة", pt: "Abrir comparador" }),

  "war.combat.alertsTitle": S("Recent alerts", { es: "Alertas recientes", fr: "Alertes récentes", de: "Neueste Alerts", ru: "Недавние оповещения", zh: "近期提醒", ko: "최근 알림", ja: "最近のアラート", ar: "تنبيهات حديثة", pt: "Alertas recentes" }),
  "war.combat.alertsSub": S("Real smart-wallet activity from the public API.", {
    es: "Actividad real de smart wallets desde API pública.",
    fr: "Activité réelle des smart wallets via l’API publique.",
    de: "Echte Smart-Wallet-Aktivität über die öffentliche API.",
    ru: "Реальная активность smart wallets из публичного API.",
    zh: "来自公共 API 的真实聪明钱活动。",
    ko: "공개 API의 실제 스마트 월렛 활동.",
    ja: "公開APIからの実スマートウォレット活動。",
    ar: "نشاط محافظ ذكية حقيقي من واجهة API العامة.",
    pt: "Atividade real de smart wallets da API pública."
  }),
  "war.combat.alertsEmpty": S("No alerts yet", { es: "Aún no hay alertas", fr: "Pas encore d’alertes", de: "Noch keine Alerts", ru: "Пока нет оповещений", zh: "暂无提醒", ko: "아직 알림 없음", ja: "まだアラートなし", ar: "لا تنبيهات بعد", pt: "Ainda sem alertas" }),

  "cockpit.desk.intelLabel": S("Intel desk"),
  "cockpit.desk.live": S("Live", { es: "En vivo" }),
  "cockpit.desk.syncing": S("Syncing", { es: "Sincronizando" }),
  "cockpit.desk.clear": S("Clear", { es: "Limpiar", fr: "Effacer", de: "Leeren", it: "Cancella", ru: "Сброс", zh: "清除", ko: "지우기", ja: "クリア", ar: "مسح", pt: "Limpar" }),
  "cockpit.desk.openTerminal": S("Open full terminal", { es: "Abrir terminal completo", fr: "Ouvrir le terminal complet", de: "Vollständiges Terminal öffnen", it: "Apri terminale completo", ru: "Открыть полный терминал", zh: "打开完整终端", ko: "전체 터미널 열기", ja: "フルターミナルを開く", ar: "فتح الطرفية الكاملة", pt: "Abrir terminal completo" }),
  "cockpit.desk.selectTitle": S("Select a token", { es: "Selecciona un token", fr: "Sélectionnez un jeton", de: "Token auswählen", it: "Seleziona un token", ru: "Выберите токен", zh: "选择代币", ko: "토큰 선택", ja: "トークンを選択", ar: "اختر رمزًا", pt: "Selecione um token" }),
  "cockpit.desk.selectBody": S("Click a card in the feed to pin it here via the URL, or paste a mint below.", {
    es: "Haz clic en una carta del feed para fijarla aquí vía URL, o pega un mint abajo.",
    fr: "Cliquez sur une carte du flux pour l’épingler ici via l’URL, ou collez un mint ci-dessous.",
    de: "Klicken Sie eine Karte im Feed, um sie per URL hier zu pinnen, oder fügen Sie unten einen Mint ein.",
    it: "Clicca una card nel feed per fissarla qui via URL, oppure incolla un mint sotto.",
    ru: "Нажмите карточку в ленте, чтобы закрепить её здесь через URL, или вставьте mint ниже.",
    zh: "点击信息流中的卡片通过 URL 固定到此处，或在下方粘贴 mint。",
    ko: "피드의 카드를 클릭해 URL로 여기 고정하거나 아래에 mint를 붙여넣으세요.",
    ja: "フィードのカードをクリックしてURLで固定するか、下にmintを貼り付けます。",
    ar: "انقر بطاقة في التدفق لتثبيتها هنا عبر الرابط، أو الصق mint أدناه.",
    pt: "Clique num card do feed para fixar aqui via URL, ou cole um mint abaixo."
  }),
  "cockpit.desk.radarCtxTitle": S("Radar context (pinned)", { es: "Contexto radar (fijado)" }),
  "cockpit.desk.radarCtxHelp": S(
    "This bar reflects tamper-checked ?ctx= from the feed. It disappears if the URL had stale ctx or you edited ?t= without a matching ctx (we scrub junk bookmarks).",
    {
      es: "Esta franja refleja ?ctx= comprobado desde el feed. Desaparece si la URL traía ctx obsoleto o cambiaste ?t= sin ctx coherente (limpiamos marcadores basura).",
      pt: "Esta faixa reflete ?ctx= verificado a partir do feed. Some se a URL tinha ctx obsoleto ou se editou ?t= sem ctx correspondente (removemos lixo de bookmark)."
    }
  ),
  "cockpit.desk.loadingToken": S("Loading token context…", { es: "Cargando contexto del token…" }),
  "cockpit.desk.tokenError": S("Token API unavailable — score socket still live.", {
    es: "API de token no disponible — el socket de score sigue en vivo."
  }),
  "cockpit.desk.waitingScore": S("Waiting for score…", { es: "Esperando score…" }),
  "cockpit.desk.confidence": S("Confidence", { es: "Confianza" }),
  "cockpit.desk.integrity": S("Integrity:", { es: "Integridad:" }),
  "cockpit.desk.jupiterTitle": S("Execution · Jupiter quick buy", { es: "Ejecución · compra rápida Jupiter" }),
  "cockpit.desk.smartWallets": S("Smart wallets"),
  "cockpit.desk.antiSignal": S("Risk trap", { es: "Trampa de riesgo" }),
  "cockpit.desk.quickScan": S("Command scan", { es: "Escaneo de comando" }),
  "cockpit.desk.invalidMint": S("Invalid mint.", { es: "Mint no válido." }),

  "cockpit.desk.tripleTitle": S("Execution regime", { es: "Régimen de ejecución" }),
  "cockpit.desk.tripleAdvisory": S("Client-side risk layer — not financial advice", {
    es: "Capa de riesgo en cliente — no es asesoramiento financiero"
  }),
  "cockpit.desk.triplePoolAgeNote": S("Pool age unknown — execution score capped at 80", {
    es: "Edad del pool desconocida — puntuación de ejecución limitada a 80"
  }),
  "cockpit.desk.barSignal": S("Technical Read", { es: "Lectura técnica" }),
  "cockpit.desk.barExecution": S("Execution", { es: "Ejecución" }),
  "cockpit.desk.barOverheat": S("Overheat", { es: "Sobrecalentamiento" }),
  "cockpit.desk.tripleContext.illiquidSlippage": S("Illiquid / High Slippage", {
    es: "Iliquidez / slippage alto"
  }),
  "cockpit.desk.tripleContext.parabolicIlliquid": S("Parabolic & Illiquid", { es: "Parabólico e ilíquido" }),
  "cockpit.desk.tripleContext.severelyOverextended": S("Severely Overextended", { es: "Sobreextendido" }),
  "cockpit.desk.tripleContext.thinOrderbook": S("Thin Orderbook", { es: "Libro fino" }),
  "cockpit.desk.tripleContext.healthyAccumulation": S("Healthy Accumulation", { es: "Acumulación sana" }),
  "cockpit.desk.tripleContext.consolidating": S("Consolidating Regime", { es: "Régimen de consolidación" }),
  "cockpit.desk.tripleAction.BUY": S("🟢 EXECUTABLE SIGNAL", { es: "🟢 SEÑAL EJECUTABLE" }),
  "cockpit.desk.tripleAction.WATCH": S("🟡 WAIT FOR PULLBACK", { es: "🟡 ESPERAR RETROCESO" }),
  "cockpit.desk.tripleAction.SCALP": S("🟠 HIGH RISK SCALP", { es: "🟠 SCALP ALTO RIESGO" }),
  "cockpit.desk.tripleAction.AVOID": S("🔴 TOXIC / ILLIQUID", { es: "🔴 TÓXICO / ILÍQUIDO" }),

  "cockpit.proof.title": S("Verified Track Record", { es: "Historial verificado" }),
  "cockpit.proof.subtitle": S("Historical performance of comparable signals", {
    es: "Rendimiento histórico de señales comparables",
    fr: "Performance historique de signaux comparables",
    de: "Historische Performance vergleichbarer Signale",
    it: "Performance storica di segnali comparabili",
    ru: "Историческая доходность сопоставимых сигналов",
    zh: "可比信号的历史表现",
    ko: "유사 시그널의 과거 성과",
    ja: "比較可能シグナルの過去パフォーマンス",
    ar: "أداء إشارات مماثلة تاريخيًا",
    pt: "Desempenho histórico de sinais comparáveis"
  }),
  "cockpit.proof.similarSignals": S("{{n}} similar signals", { es: "{{n}} señales similares", fr: "{{n}} signaux similaires", de: "{{n}} ähnliche Signale", it: "{{n}} segnali simili", ru: "{{n}} похожих сигналов", zh: "{{n}} 条相似信号", ko: "유사 시그널 {{n}}개", ja: "類似シグナル {{n}}件", ar: "{{n}} إشارات مشابهة", pt: "{{n}} sinais similares" }),
  "cockpit.proof.loading": S("Loading cohort…", { es: "Cargando cohorte…" }),
  "cockpit.proof.error": S("Edge stats temporarily unavailable.", { es: "Estadísticas de edge no disponibles temporalmente." }),
  "cockpit.proof.insufficientTitle": S("Not enough comparable historical signals yet.", {
    es: "Aún no hay suficientes señales históricas comparables.",
    fr: "Pas encore assez de signaux historiques comparables.",
    de: "Noch nicht genug vergleichbare historische Signale.",
    it: "Non ancora abbastanza segnali storici comparabili.",
    ru: "Пока недостаточно сопоставимых исторических сигналов.",
    zh: "可比历史信号尚不足。",
    ko: "비교 가능한 과거 시그널이 아직 부족합니다.",
    ja: "比較可能な履歴シグナルがまだ不足しています。",
    ar: "لا توجد بعد إشارات تاريخية كافية للمقارنة.",
    pt: "Ainda não há sinais históricos comparáveis suficientes."
  }),
  "cockpit.proof.insufficientMeta": S("Need ≥{{min}} resolved rows in-band (last {{days}}d).", {
    es: "Se necesitan ≥{{min}} filas resueltas en banda (últimos {{days}}d)."
  }),
  "cockpit.proof.basedOn": S("Based on:", { es: "Basado en:", fr: "Basé sur :", de: "Basierend auf:", it: "Basato su:", ru: "На основе:", zh: "基于：", ko: "기준:", ja: "根拠:", ar: "استنادًا إلى:", pt: "Com base em:" }),
  "cockpit.proof.criteriaFallback": S("score range · smart wallet count · entry timing · market regime"),
  "cockpit.proof.hit40": S("Hit +40% (30m)"),
  "cockpit.proof.hit100": S("Hit +100% (2h)"),
  "cockpit.proof.median": S("Median", { es: "Mediana", fr: "Médiane", de: "Median", it: "Mediana", ru: "Медиана", zh: "中位数", ko: "중앙값", ja: "中央値", ar: "الوسيط", pt: "Mediana" }),
  "cockpit.proof.updated": S("Updated {{age}}", { es: "Actualizado {{age}}", fr: "Mis à jour {{age}}", de: "Aktualisiert {{age}}", it: "Aggiornato {{age}}", ru: "Обновлено {{age}}", zh: "更新于 {{age}}", ko: "{{age}} 업데이트", ja: "更新 {{age}}", ar: "محدّث {{age}}", pt: "Atualizado {{age}}" }),
  "cockpit.proof.disclaimer": S("Statistical reference, not financial advice", {
    es: "Referencia estadística, no es asesoramiento financiero",
    fr: "Référence statistique, pas un conseil financier",
    de: "Statistische Referenz, keine Finanzberatung",
    it: "Riferimento statistico, non consulenza finanziaria",
    ru: "Статистическая справка, не финансовый совет",
    zh: "统计参考，非投资建议",
    ko: "통계 참고용이며 투자 조언이 아닙니다",
    ja: "統計的参考であり金融アドバイスではありません",
    ar: "مرجع إحصائي وليس نصيحة مالية",
    pt: "Referência estatística, não aconselhamento financeiro"
  }),
  "cockpit.proof.ageSeconds": S("{{sec}}s ago", { es: "hace {{sec}}s" }),
  "cockpit.proof.ageMinutes": S("{{min}}m ago", { es: "hace {{min}}m" }),

  "war.history.title": S("24h verified outcomes", { es: "Resultados verificados 24h", fr: "Résultats vérifiés 24h", de: "24h verifizierte Outcomes", ru: "Проверенные итоги за 24ч", zh: "24小时已验证结果", ko: "24시간 검증 결과", ja: "24時間検証済み", ar: "نتائج موثقة خلال 24 ساعة", pt: "Resultados verificados 24h" }),
  "war.history.subtitle": S("On-chain linked signals from the last 24 hours.", {
    es: "Señales enlazadas on-chain de las últimas 24 horas.",
    fr: "Signaux liés on-chain sur les dernières 24 heures.",
    de: "On-chain verknüpfte Signale der letzten 24 Stunden.",
    ru: "Привязанные к on-chain сигналы за 24 часа.",
    zh: "过去24小时链上关联信号。",
    ko: "지난 24시간 온체인 연결 시그널.",
    ja: "過去24時間のオンチェーン連携シグナル。",
    ar: "إشارات مرتبطة على السلسلة خلال آخر 24 ساعة.",
    pt: "Sinais ligados on-chain nas últimas 24 horas."
  }),
  "war.history.empty": S("No rows in the last 24h. Add signals and prices in Supabase, or switch to LIVE.", {
    es: "Sin filas en 24h. Añade señales y precios en Supabase, o cambia a LIVE.",
    fr: "Aucune ligne sur 24h. Ajoutez signaux et prix dans Supabase, ou passez à LIVE.",
    de: "Keine Zeilen in 24h. Signale/Preise in Supabase ergänzen oder zu LIVE wechseln.",
    ru: "Нет строк за 24ч. Добавьте сигналы и цены в Supabase или переключитесь на LIVE.",
    zh: "24小时内无行。请在 Supabase 补充信号与价格，或切换到 LIVE。",
    ko: "24시간 내 행이 없습니다. Supabase에 시그널·가격을 추가하거나 LIVE로 전환하세요.",
    ja: "24時間内に行がありません。Supabaseに追加するかLIVEへ。",
    ar: "لا صفوف في آخر 24س. أضف الإشارات والأسعار في Supabase أو انتقل إلى LIVE.",
    pt: "Sem linhas em 24h. Adicione sinais e preços no Supabase ou mude para LIVE."
  }),

  "war.live.coordTitle": S("Coordination (desk)"),
  "war.live.coordMeta": S("· prior verified (T+N / legacy): {{n}} cluster alerts", {
    es: "· verificado previo (T+N / legado): {{n}} alertas de cluster"
  }),
  "war.live.tokenSheetLink": S("Token page →", { es: "Ficha del token →", fr: "Fiche token →", de: "Token-Seite →", pt: "Página do token →" }),

  "layout.menu": S("Menu", { es: "Menú", fr: "Menu", de: "Menü", it: "Menu", ru: "Меню", zh: "菜单", ko: "메뉴", ja: "メニュー", ar: "القائمة", pt: "Menu" }),

  "nav.dash": S("Dashboard", { es: "Panel", fr: "Tableau de bord", de: "Dashboard", it: "Cruscotto", ru: "Панель", zh: "控制台", ko: "대시보드", ja: "ダッシュボード", ar: "لوحة التحكم", pt: "Painel" }),
  "nav.results": S("Results", { es: "Resultados", fr: "Résultats", de: "Ergebnisse", it: "Risultati", ru: "Результаты", zh: "结果", ko: "결과", ja: "結果", ar: "النتائج", pt: "Resultados" }),
  "nav.scanner": S("Scanner", { es: "Escáner", fr: "Scanner", de: "Scanner", it: "Scanner", ru: "Сканер", zh: "扫描器", ko: "스캐너", ja: "スキャナ", ar: "الماسح", pt: "Scanner" }),
  "nav.smart": S("Smart Money", { es: "Smart money", fr: "Smart money", de: "Smart Money", it: "Smart money", ru: "Smart money", zh: "聪明钱", ko: "스마트 머니", ja: "スマートマネー", ar: "الأموال الذكية", pt: "Smart money" }),
  "nav.alerts": S("Alerts", { es: "Alertas", fr: "Alertes", de: "Alerts", it: "Avvisi", ru: "Оповещения", zh: "提醒", ko: "알림", ja: "アラート", ar: "التنبيهات", pt: "Alertas" }),
  "nav.pricing": S("Go PRO", { es: "Ir a PRO", fr: "Passer PRO", de: "PRO werden", it: "Passa a PRO", ru: "PRO", zh: "升级 PRO", ko: "PRO로", ja: "PROへ", ar: "ترقية PRO", pt: "Ir ao PRO" }),
  "nav.grave": S("Graveyard", { es: "Cementerio", fr: "Cimetière", de: "Friedhof", it: "Cimitero", ru: "Кладбище", zh: "墓地", ko: "무덤", ja: "墓場", ar: "المقبرة", pt: "Cemitério" }),
  "nav.stalker": S("Stalker", { es: "Stalker", fr: "Stalker", de: "Stalker", it: "Stalker", ru: "Сталкер", zh: "跟踪", ko: "스토커", ja: "ストーカー", ar: "المُراقب", pt: "Stalker" }),
  "nav.compare": S("Compare", { es: "Comparar", fr: "Comparer", de: "Vergleichen", it: "Confronta", ru: "Сравнить", zh: "对比", ko: "비교", ja: "比較", ar: "مقارنة", pt: "Comparar" }),
  "nav.watch": S("Watchlist", { es: "Watchlist", fr: "Watchlist", de: "Watchlist", it: "Watchlist", ru: "Список наблюдения", zh: "自选", ko: "관심목록", ja: "ウォッチリスト", ar: "قائمة المراقبة", pt: "Watchlist" }),
  "nav.port": S("Portfolio", { es: "Cartera", fr: "Portefeuille", de: "Portfolio", it: "Portafoglio", ru: "Портфель", zh: "投资组合", ko: "포트폴리오", ja: "ポートフォリオ", ar: "المحفظة", pt: "Carteira" }),

  "footer.brand": S("Sentinel Ledger"),
  "footer.tagline": S(
    "Solana intelligence terminal — not financial advice. The strip under the header shows where you are and what to do next.",
    {
      es: "Terminal de inteligencia en Solana — no es asesoramiento financiero. La franja bajo el encabezado indica dónde estás y el siguiente paso.",
      fr: "Terminal d’intelligence Solana — pas un conseil financier. La bande sous l’en-tête indique où vous êtes et la suite.",
      de: "Solana-Intelligence-Terminal — keine Finanzberatung. Der Streifen unter der Kopfzeile zeigt Standort und nächsten Schritt.",
      pt: "Terminal de inteligência Solana — não é aconselhamento financeiro. A faixa sob o cabeçalho mostra onde você está e o próximo passo."
    }
  ),
  "footer.disclaimer": S(
    "Sentinel Ledger is an informational tool. It does not provide financial, investment, legal, or tax advice. Information may be incomplete or delayed. You alone are responsible for your decisions. Trading digital assets involves substantial risk.",
    {
      es: "Sentinel Ledger es una herramienta informativa. No ofrece asesoramiento financiero, de inversión, legal ni fiscal. La información puede estar incompleta o retrasada. Usted es el único responsable de sus decisiones. Operar activos digitales conlleva un riesgo considerable.",
      fr: "Sentinel Ledger est un outil d’information. Il ne fournit pas de conseil financier, juridique ou fiscal. Les données peuvent être incomplètes. Vous restez seul responsable de vos décisions. Le trading d’actifs numériques comporte des risques importants.",
      de: "Sentinel Ledger ist ein Informationswerkzeug. Keine Finanz-, Anlage-, Rechts- oder Steuerberatung. Angaben können unvollständig sein. Sie tragen die Entscheidung. Der Handel mit digitalen Vermögenswerten ist riskant.",
      pt: "Sentinel Ledger é uma ferramenta informativa. Não oferece aconselhamento financeiro, jurídico ou fiscal. As informações podem estar incompletas. Você é o único responsável pelas decisões. Negociar ativos digitais envolve risco substancial."
    }
  ),
  "footer.link.results": S("Results", { es: "Resultados", fr: "Résultats", de: "Ergebnisse", ru: "Результаты", zh: "结果", ko: "결과", ja: "結果", ar: "النتائج", pt: "Resultados" }),
  "footer.link.scanner": S("Scanner", { es: "Escáner", fr: "Scanner", de: "Scanner", zh: "扫描", ko: "스캐너", ja: "スキャナ", ar: "الماسح", pt: "Scanner" }),
  "footer.link.smart": S("Smart Money", { es: "Smart money", zh: "聪明钱", ko: "스마트 머니", ja: "スマートマネー", ar: "الأموال الذكية", pt: "Smart money" }),
  "footer.link.compare": S("Compare", { es: "Comparar", fr: "Comparer", de: "Vergleichen", zh: "对比", ko: "비교", ja: "比較", ar: "مقارنة", pt: "Comparar" }),
  "footer.link.watch": S("Watchlist", { es: "Watchlist", zh: "自选", ko: "관심목록", ja: "ウォッチリスト", ar: "قائمة المراقبة", pt: "Watchlist" }),
  "footer.link.port": S("Portfolio", { es: "Cartera", fr: "Portefeuille", de: "Portfolio", zh: "投资组合", ko: "포트폴리오", ja: "ポートフォリオ", ar: "المحفظة", pt: "Carteira" }),
  "footer.link.alerts": S("Alerts", { es: "Alertas", fr: "Alertes", zh: "提醒", ko: "알림", ja: "アラート", ar: "التنبيهات", pt: "Alertas" }),
  "footer.link.pricing": S("Pricing", { es: "Precios", fr: "Tarifs", de: "Preise", zh: "定价", ko: "가격", ja: "料金", ar: "الأسعار", pt: "Preços" }),
  "footer.link.ops": S("Ops", { es: "Ops", zh: "运维", ko: "운영", ja: "運用", ar: "العمليات", pt: "Ops" }),
  "footer.link.terms": S("Terms", { es: "Términos", fr: "Conditions", de: "AGB", zh: "条款", ko: "약관", ja: "利用規約", ar: "الشروط", pt: "Termos" }),
  "footer.link.privacy": S("Privacy", { es: "Privacidad", fr: "Confidentialité", de: "Datenschutz", zh: "隐私", ko: "개인정보", ja: "プライバシー", ar: "الخصوصية", pt: "Privacidade" }),
  "footer.link.legal": S("Legal", { es: "Legal", fr: "Mentions légales", de: "Rechtliches", zh: "法律信息", ko: "법적 고지", ja: "法的情報", ar: "قانوني", pt: "Legal" }),
  "footer.link.contact": S("Contact", { es: "Contacto", fr: "Contact", de: "Kontakt", zh: "联系", ko: "문의", ja: "お問い合わせ", ar: "اتصل", pt: "Contato" }),
  "footer.link.twitter": S("Twitter", { es: "Twitter", zh: "推特", ko: "트위터", ja: "Twitter", ar: "تويتر", pt: "Twitter" }),
  "footer.link.github": S("GitHub", { es: "GitHub", zh: "GitHub", ko: "GitHub", ja: "GitHub", ar: "GitHub", pt: "GitHub" }),

  ...WAYFINDING_FLAT_STRINGS,

  ...WALLET_FLAT_STRINGS,

  ...ALERTS_PAGE_STRINGS,

  ...CONTACT_LEGAL_PAGE_STRINGS,

  ...GRAVEYARD_PAGE_STRINGS,

  ...PRIVACY_TERMS_PAGE_STRINGS,

  ...MEDIUM_PAGES_STRINGS,

  ...PRICING_PAGE_STRINGS,

  ...STALKER_PAGE_STRINGS,

  ...TOKEN_PAGE_STRINGS,

  ...COMPARE_PAGE_STRINGS,

  ...SMART_MONEY_PAGE_STRINGS,

  ...HOME_PAGE_STRINGS,

  ...OPS_PAGE_STRINGS,

  ...TERMINAL_LEXICON_STRINGS
};
