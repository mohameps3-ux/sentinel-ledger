/** Signal Graveyard page */

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
export const GRAVEYARD_PAGE_STRINGS = {
  "graveyard.pageTitle": S("Signal Graveyard — Sentinel Ledger", {
    es: "Cementerio de señales — Sentinel Ledger",
    fr: "Cimetière des signaux — Sentinel Ledger",
    de: "Signal-Friedhof — Sentinel Ledger",
    it: "Cimitero dei segnali — Sentinel Ledger",
    ru: "Кладбище сигналов — Sentinel Ledger",
    zh: "信号墓地 — Sentinel Ledger",
    ko: "시그널 묘지 — Sentinel Ledger",
    ja: "シグナル墓場 — Sentinel Ledger",
    ar: "مقبرة الإشارات — Sentinel Ledger",
    pt: "Cemitério de sinais — Sentinel Ledger"
  }),
  "graveyard.pageDescription": S("Public scorecard of historical signals with 4h/24h outcomes.", {
    es: "Marcador público de señales históricas con resultados a 4h/24h.",
    fr: "Tableau public de signaux historiques avec résultats 4h/24h.",
    de: "Öffentliche Auswertung historischer Signale mit 4h/24h-Ergebnissen.",
    it: "Scorecard pubblica di segnali storici con esiti 4h/24h.",
    ru: "Публичная таблица исторических сигналов с исходами за 4ч/24ч.",
    zh: "历史信号的公开记分牌，含 4 小时 / 24 小时结果。",
    ko: "4시간/24시간 결과가 있는 과거 시그널 공개 스코어카드.",
    ja: "4時間/24時間アウトカム付きの履歴シグナル公開スコアカード。",
    ar: "سجل علني لإشارات تاريخية مع نتائج 4س/24س.",
    pt: "Painel público de sinais históricos com resultados 4h/24h."
  }),
  "graveyard.kicker": S("Public transparency", {
    es: "Transparencia pública",
    fr: "Transparence publique",
    de: "Öffentliche Transparenz",
    it: "Trasparenza pubblica",
    ru: "Публичная прозрачность",
    zh: "公开透明",
    ko: "공개 투명성",
    ja: "公開の透明性",
    ar: "شفافية عامة",
    pt: "Transparência pública"
  }),
  "graveyard.h1": S("Signal Graveyard", {
    es: "Cementerio de señales",
    fr: "Cimetière des signaux",
    de: "Signal-Friedhof",
    it: "Cimitero dei segnali",
    ru: "Кладбище сигналов",
    zh: "信号墓地",
    ko: "시그널 묘지",
    ja: "シグナル墓場",
    ar: "مقبرة الإشارات",
    pt: "Cemitério de sinais"
  }),
  "graveyard.intro": S("Win rate visible for everyone. Historical outcomes for trust and verification.", {
    es: "Win rate visible para todos. Resultados históricos para confianza y verificación.",
    fr: "Taux de réussite visible par tous. Résultats historiques pour confiance et vérification.",
    de: "Trefferquote für alle sichtbar. Historische Ergebnisse zur Verifikation.",
    it: "Win rate visibile a tutti. Esiti storici per fiducia e verifica.",
    ru: "Винрейт виден всем. Исторические исходы для доверия и проверки.",
    zh: "所有人可见胜率。历史结果用于信任与核验。",
    ko: "모두에게 보이는 승률. 신뢰와 검증을 위한 과거 결과.",
    ja: "誰でも見られる勝率。信頼と検証のための履歴アウトカム。",
    ar: "معدل الفوز ظاهر للجميع. نتائج تاريخية للثقة والتحقق.",
    pt: "Taxa de vitória visível para todos. Resultados históricos para confiança e verificação."
  }),
  "graveyard.from": S("From", {
    es: "Desde",
    fr: "De",
    de: "Von",
    it: "Da",
    ru: "С",
    zh: "从",
    ko: "시작",
    ja: "開始",
    ar: "من",
    pt: "De"
  }),
  "graveyard.to": S("To", {
    es: "Hasta",
    fr: "À",
    de: "Bis",
    it: "A",
    ru: "По",
    zh: "至",
    ko: "종료",
    ja: "終了",
    ar: "إلى",
    pt: "Até"
  }),
  "graveyard.outcome": S("Outcome", {
    es: "Resultado",
    fr: "Résultat",
    de: "Ergebnis",
    it: "Esito",
    ru: "Исход",
    zh: "结果",
    ko: "결과",
    ja: "結果",
    ar: "النتيجة",
    pt: "Resultado"
  }),
  "graveyard.optAll": S("ALL", { es: "TODOS", fr: "TOUS", de: "ALLE", ru: "ВСЕ", zh: "全部", ko: "전체", ja: "すべて", ar: "الكل", pt: "TODOS" }),
  "graveyard.optWin": S("WIN", { es: "WIN", fr: "WIN", de: "WIN", ru: "WIN", zh: "盈利", ko: "승", ja: "勝", ar: "فوز", pt: "WIN" }),
  "graveyard.optLoss": S("LOSS", { es: "LOSS", fr: "LOSS", de: "LOSS", ru: "LOSS", zh: "亏损", ko: "패", ja: "負", ar: "خسارة", pt: "LOSS" }),
  "graveyard.optPending": S("PENDING", { es: "PENDIENTE", fr: "EN ATTENTE", de: "OFFEN", ru: "В ОЖИДАНИИ", zh: "待定", ko: "대기", ja: "保留", ar: "معلق", pt: "PENDENTE" }),
  "graveyard.winRateLabel": S("Win rate:", {
    es: "Win rate:",
    fr: "Taux de réussite :",
    de: "Trefferquote:",
    it: "Win rate:",
    ru: "Винрейт:",
    zh: "胜率：",
    ko: "승률:",
    ja: "勝率:",
    ar: "معدل الفوز:",
    pt: "Taxa de vitória:"
  }),
  "graveyard.thToken": S("Token", {
    es: "Token",
    fr: "Jeton",
    de: "Token",
    it: "Token",
    ru: "Токен",
    zh: "代币",
    ko: "토큰",
    ja: "トークン",
    ar: "الرمز",
    pt: "Token"
  }),
  "graveyard.thStrength": S("Strength", {
    es: "Fuerza",
    fr: "Force",
    de: "Stärke",
    it: "Forza",
    ru: "Сила",
    zh: "强度",
    ko: "강도",
    ja: "強度",
    ar: "القوة",
    pt: "Força"
  }),
  "graveyard.thAction": S("Action", {
    es: "Acción",
    fr: "Action",
    de: "Aktion",
    it: "Azione",
    ru: "Действие",
    zh: "动作",
    ko: "액션",
    ja: "アクション",
    ar: "الإجراء",
    pt: "Ação"
  }),
  "graveyard.th4h": S("4h", { es: "4h", fr: "4h", de: "4h", it: "4h", ru: "4ч", zh: "4小时", ko: "4시간", ja: "4時間", ar: "4س", pt: "4h" }),
  "graveyard.th24h": S("24h", { es: "24h", fr: "24h", de: "24h", it: "24h", ru: "24ч", zh: "24小时", ko: "24시간", ja: "24時間", ar: "24س", pt: "24h" }),
  "graveyard.thOutcome": S("Outcome", {
    es: "Resultado",
    fr: "Résultat",
    de: "Ergebnis",
    it: "Esito",
    ru: "Исход",
    zh: "结果",
    ko: "결과",
    ja: "結果",
    ar: "النتيجة",
    pt: "Resultado"
  }),
  "graveyard.thRunUp": S("Max run-up", {
    es: "Máx. subida",
    fr: "Hausse max",
    de: "Max. Lauf",
    it: "Max rialzo",
    ru: "Макс. рост",
    zh: "最大涨幅",
    ko: "최대 런업",
    ja: "最大上昇",
    ar: "أقصى صعود",
    pt: "Máx. alta"
  }),
  "graveyard.thDrawdown": S("Max drawdown", {
    es: "Máx. caída",
    fr: "Baisse max",
    de: "Max. Drawdown",
    it: "Max drawdown",
    ru: "Макс. просадка",
    zh: "最大回撤",
    ko: "최대 낙폭",
    ja: "最大ドローダウン",
    ar: "أقصى هبوط",
    pt: "Máx. queda"
  }),
  "graveyard.runUpTitle": S("Highest vs entry: DEX spot min/max over ~25h when tracked, else job checkpoints and implied 24h.", {
    es: "Máximo vs entrada: spot DEX mín/máx ~25h si el job lo registró, si no checkpoints e implícito 24h."
  }),
  "graveyard.drawdownTitle": S("Lowest vs entry: DEX spot min/max over ~25h when tracked, else job checkpoints and implied 24h.", {
    es: "Mínimo vs entrada: spot DEX mín/máx ~25h si el job lo registró, si no checkpoints e implícito 24h."
  }),
  "graveyard.extremaFoot": S("Run-up and drawdown prefer min/max of DEX spot the worker samples after the signal (about 25h); if not available, the min/max of checkpoints (5m–4h) plus 24h from result% — not full tick-level OHLC.", {
    es: "Subida y caída prefieren mín/máx de spot DEX que el job muestrea tras la señal (~25h); si no hay, mín/máx de checkpoints (5m–4h) y 24h desde result% — no es OHLC de todos los ticks."
  }),
  "graveyard.empty": S("No signals in this range.", {
    es: "No hay señales en este rango.",
    fr: "Aucun signal sur cette plage.",
    de: "Keine Signale in diesem Bereich.",
    it: "Nessun segnale in questo intervallo.",
    ru: "Нет сигналов в этом диапазоне.",
    zh: "该范围内无信号。",
    ko: "이 구간에 시그널이 없습니다.",
    ja: "この範囲にシグナルはありません。",
    ar: "لا إشارات في هذا النطاق.",
    pt: "Sem sinais neste intervalo."
  })
};
