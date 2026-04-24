/** PRO Alerts page — flat i18n. Missing locale → English via S(). */

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
export const ALERTS_PAGE_STRINGS = {
  "alerts.pageTitle": S("PRO alerts — Sentinel Ledger", {
    es: "Alertas PRO — Sentinel Ledger",
    fr: "Alertes PRO — Sentinel Ledger",
    de: "PRO-Alerts — Sentinel Ledger",
    it: "Avvisi PRO — Sentinel Ledger",
    ru: "PRO-оповещения — Sentinel Ledger",
    zh: "PRO 提醒 — Sentinel Ledger",
    ko: "PRO 알림 — Sentinel Ledger",
    ja: "PROアラート — Sentinel Ledger",
    ar: "تنبيهات PRO — Sentinel Ledger",
    pt: "Alertas PRO — Sentinel Ledger"
  }),
  "alerts.pageDescription": S(
    "Telegram alerts when watchlist tokens move beyond your thresholds. PRO feature.",
    {
      es: "Alertas por Telegram cuando los tokens del watchlist superan tus umbrales. Función PRO.",
      fr: "Alertes Telegram quand les jetons de la watchlist dépassent vos seuils. Fonction PRO.",
      de: "Telegram-Benachrichtigungen bei Watchlist-Bewegungen über Schwellen. PRO-Feature.",
      it: "Avvisi Telegram quando i token in watchlist superano le soglie. Funzione PRO.",
      ru: "Уведомления в Telegram при движении токенов из списка наблюдения. Функция PRO.",
      zh: "自选代币超过阈值时通过 Telegram 提醒。PRO 功能。",
      ko: "관심목록 토큰이 임계값을 넘으면 텔레그램 알림. PRO 기능.",
      ja: "ウォッチリストのトークンが閾値を超えたらTelegram通知。PRO機能。",
      ar: "تنبيهات تيليجرام عند تجاوز رموز قائمة المراقبة للعتبات. ميزة PRO.",
      pt: "Alertas Telegram quando os tokens da watchlist ultrapassam os limiares. Recurso PRO."
    }
  ),
  "alerts.proLabel": S("PRO", { es: "PRO", fr: "PRO", de: "PRO", ru: "PRO", zh: "PRO", ko: "PRO", ja: "PRO", ar: "PRO", pt: "PRO" }),
  "alerts.heroTitle": S("Alert system", {
    es: "Sistema de alertas",
    fr: "Système d’alertes",
    de: "Alert-System",
    it: "Sistema di avvisi",
    ru: "Система оповещений",
    zh: "提醒系统",
    ko: "알림 시스템",
    ja: "アラートシステム",
    ar: "نظام التنبيهات",
    pt: "Sistema de alertas"
  }),
  "alerts.dispatchTitle": S("Priority dispatch", {
    es: "Despacho prioritario",
    pt: "Despacho prioritário"
  }),
  "alerts.dispatchSubtitle": S("Last 5 · urgent & surefire class only", {
    es: "Últimas 5 · solo clase urgent y surefire",
    pt: "Últimas 5 · apenas urgent e surefire"
  }),
  "alerts.dispatchEmpty": S("No priority-class dispatches on file for this account.", {
    es: "Sin despachos de clase prioritaria registrados para esta cuenta.",
    pt: "Sem despachos de classe prioritária registados nesta conta."
  }),
  "alerts.dispatchColTime": S("Time", { es: "Hora", pt: "Hora" }),
  "alerts.dispatchColClass": S("Class", { es: "Clase", pt: "Classe" }),
  "alerts.dispatchColSubject": S("Subject", { es: "Asunto", pt: "Assunto" }),
  "alerts.dispatchColRef": S("Reference", { es: "Ref.", pt: "Ref." }),
  "alerts.dispatchFoot": S(
    "Tactical and info-tier traffic is not shown here — only material flagged urgent or surefire per Sentinel routing.",
    {
      es: "El tráfico táctico e informativo no se muestra aquí — solo lo marcado urgent o surefire según el enrutado Sentinel.",
      pt: "Tráfego táctico e informativo não aparece aqui — só urgent ou surefire pelo roteamento Sentinel."
    }
  ),
  "alerts.heroBody": S(
    "Telegram when your watchlist moves beyond your threshold (Conservative / Balanced / Aggressive). Not financial advice.",
    {
      es: "Telegram cuando tu watchlist supera el umbral (Conservador / Equilibrado / Agresivo). No es asesoramiento financiero.",
      fr: "Telegram lorsque la watchlist dépasse le seuil (Prudent / Équilibré / Agressif). Pas un conseil financier.",
      de: "Telegram, wenn die Watchlist die Schwelle überschreitet. Keine Finanzberatung.",
      it: "Telegram quando la watchlist supera la soglia. Non è consulenza finanziaria.",
      ru: "Telegram при превышении порога в watchlist. Не финансовый совет.",
      zh: "自选超过阈值时通过 Telegram 通知。非投资建议。",
      ko: "관심목록이 임계값을 넘으면 텔레그램. 투자 조언 아님.",
      ja: "ウォッチリストが閾値を超えたらTelegram。金融アドバイスではありません。",
      ar: "عند تجاوز قائمة المراقبة للعتبة عبر تيليجرام. ليس نصيحة مالية.",
      pt: "Telegram quando a watchlist ultrapassa o limiar. Não é aconselhamento financeiro."
    }
  ),
  "alerts.toast.loadError": S("Could not load alert settings.", {
    es: "No se pudieron cargar los ajustes de alertas.",
    fr: "Impossible de charger les paramètres d’alerte.",
    de: "Alert-Einstellungen konnten nicht geladen werden.",
    ru: "Не удалось загрузить настройки оповещений.",
    zh: "无法加载提醒设置。",
    ko: "알림 설정을 불러올 수 없습니다.",
    ja: "アラート設定を読み込めませんでした。",
    ar: "تعذر تحميل إعدادات التنبيه.",
    pt: "Não foi possível carregar as definições de alertas."
  }),
  "alerts.toast.linkError": S("Could not link Telegram.", {
    es: "No se pudo vincular Telegram.",
    fr: "Impossible de lier Telegram.",
    de: "Telegram konnte nicht verknüpft werden.",
    ru: "Не удалось привязать Telegram.",
    zh: "无法绑定 Telegram。",
    ko: "텔레그램 연결 실패.",
    ja: "Telegramを連携できませんでした。",
    ar: "تعذر ربط تيليجرام.",
    pt: "Não foi possível ligar o Telegram."
  }),
  "alerts.toast.linkedSuccess": S("Telegram linked — PRO alerts enabled.", {
    es: "Telegram vinculado — alertas PRO activadas.",
    fr: "Telegram lié — alertes PRO activées.",
    de: "Telegram verknüpft — PRO-Alerts aktiv.",
    ru: "Telegram привязан — PRO-оповещения включены.",
    zh: "已绑定 Telegram — 已启用 PRO 提醒。",
    ko: "텔레그램 연결됨 — PRO 알림 켜짐.",
    ja: "Telegram連携済み — PROアラート有効。",
    ar: "تم ربط تيليجرام — تنبيهات PRO مفعّلة.",
    pt: "Telegram ligado — alertas PRO ativos."
  }),
  "alerts.toast.telegramFailed": S("Telegram link failed.", {
    es: "Falló el enlace con Telegram.",
    fr: "Échec de la liaison Telegram.",
    de: "Telegram-Verknüpfung fehlgeschlagen.",
    ru: "Ошибка привязки Telegram.",
    zh: "Telegram 绑定失败。",
    ko: "텔레그램 연결 실패.",
    ja: "Telegram連携に失敗しました。",
    ar: "فشل ربط تيليجرام.",
    pt: "Falha ao ligar o Telegram."
  }),
  "alerts.toast.updateFailed": S("Update failed.", {
    es: "Actualización fallida.",
    fr: "Mise à jour échouée.",
    de: "Aktualisierung fehlgeschlagen.",
    ru: "Обновление не удалось.",
    zh: "更新失败。",
    ko: "업데이트 실패.",
    ja: "更新に失敗しました。",
    ar: "فشل التحديث.",
    pt: "Atualização falhou."
  }),
  "alerts.toast.alertsOn": S("Alerts ON", {
    es: "Alertas: ON",
    fr: "Alertes : ON",
    de: "Alerts: AN",
    ru: "Оповещения: вкл.",
    zh: "提醒：开",
    ko: "알림: 켜짐",
    ja: "アラート：オン",
    ar: "التنبيهات: تشغيل",
    pt: "Alertas: ON"
  }),
  "alerts.toast.alertsOff": S("Alerts OFF", {
    es: "Alertas: OFF",
    fr: "Alertes : OFF",
    de: "Alerts: AUS",
    ru: "Оповещения: выкл.",
    zh: "提醒：关",
    ko: "알림: 꺼짐",
    ja: "アラート：オフ",
    ar: "التنبيهات: إيقاف",
    pt: "Alertas: OFF"
  }),
  "alerts.toast.saveError": S("Could not save.", {
    es: "No se pudo guardar.",
    fr: "Impossible d’enregistrer.",
    de: "Speichern fehlgeschlagen.",
    ru: "Не удалось сохранить.",
    zh: "无法保存。",
    ko: "저장 실패.",
    ja: "保存できませんでした。",
    ar: "تعذر الحفظ.",
    pt: "Não foi possível guardar."
  }),
  "alerts.toast.rulesSaved": S("Alert rules saved.", {
    es: "Reglas de alerta guardadas.",
    fr: "Règles d’alerte enregistrées.",
    de: "Alert-Regeln gespeichert.",
    ru: "Правила оповещений сохранены.",
    zh: "已保存提醒规则。",
    ko: "알림 규칙 저장됨.",
    ja: "アラートルールを保存しました。",
    ar: "تم حفظ قواعد التنبيه.",
    pt: "Regras de alerta guardadas."
  }),
  "alerts.toast.saveFailed": S("Save failed.", {
    es: "Guardado fallido.",
    fr: "Échec de l’enregistrement.",
    de: "Speichern fehlgeschlagen.",
    ru: "Сохранение не удалось.",
    zh: "保存失败。",
    ko: "저장 실패.",
    ja: "保存に失敗しました。",
    ar: "فشل الحفظ.",
    pt: "Falha ao guardar."
  }),
  "alerts.toast.couldNotUpdate": S("Could not update.", {
    es: "No se pudo actualizar.",
    fr: "Impossible de mettre à jour.",
    de: "Aktualisierung nicht möglich.",
    ru: "Не удалось обновить.",
    zh: "无法更新。",
    ko: "업데이트할 수 없습니다.",
    ja: "更新できませんでした。",
    ar: "تعذر التحديث.",
    pt: "Não foi possível atualizar."
  }),
  "alerts.signInPrompt": S("Connect your wallet and sign in to configure PRO alerts.", {
    es: "Conecta tu wallet e inicia sesión para configurar alertas PRO.",
    fr: "Connectez votre portefeuille et connectez-vous pour configurer les alertes PRO.",
    de: "Wallet verbinden und anmelden, um PRO-Alerts zu konfigurieren.",
    it: "Collega il wallet e accedi per configurare gli avvisi PRO.",
    ru: "Подключите кошелёк и войдите, чтобы настроить PRO-оповещения.",
    zh: "连接钱包并登录以配置 PRO 提醒。",
    ko: "지갑을 연결하고 로그인해 PRO 알림을 설정하세요.",
    ja: "ウォレットを接続してサインインし、PROアラートを設定してください。",
    ar: "اربط محفظتك وسجّل الدخول لضبط تنبيهات PRO.",
    pt: "Ligue a carteira e inicie sessão para configurar alertas PRO."
  }),
  "alerts.loading": S("Loading…", {
    es: "Cargando…",
    fr: "Chargement…",
    de: "Laden…",
    it: "Caricamento…",
    ru: "Загрузка…",
    zh: "加载中…",
    ko: "불러오는 중…",
    ja: "読み込み中…",
    ar: "جاري التحميل…",
    pt: "A carregar…"
  }),
  "alerts.upgradeTitle": S("Upgrade to PRO", {
    es: "Pásate a PRO",
    fr: "Passer à PRO",
    de: "Auf PRO upgraden",
    it: "Passa a PRO",
    ru: "Перейти на PRO",
    zh: "升级到 PRO",
    ko: "PRO로 업그레이드",
    ja: "PROにアップグレード",
    ar: "الترقية إلى PRO",
    pt: "Subscrever PRO"
  }),
  "alerts.upgradeBody": S(
    "Telegram watchlist alerts are included with an active PRO subscription.",
    {
      es: "Las alertas por Telegram del watchlist van incluidas con la suscripción PRO activa.",
      fr: "Les alertes Telegram de la watchlist sont incluses avec l’abonnement PRO actif.",
      de: "Telegram-Watchlist-Alerts sind im aktiven PRO-Abo enthalten.",
      it: "Gli avvisi Telegram per la watchlist sono inclusi con l’abbonamento PRO attivo.",
      ru: "Telegram-оповещения по watchlist входят в активную подписку PRO.",
      zh: "激活的 PRO 订阅包含 Telegram 自选提醒。",
      ko: "활성 PRO 구독에 텔레그램 관심목록 알림이 포함됩니다.",
      ja: "有効なPROサブスクにTelegramウォッチリスト通知が含まれます。",
      ar: "تنبيهات تيليجرام لقائمة المراقبة ضمن اشتراك PRO النشط.",
      pt: "Alertas Telegram da watchlist incluem-se na subscrição PRO ativa."
    }
  ),
  "alerts.viewPricing": S("View pricing", {
    es: "Ver precios",
    fr: "Voir les tarifs",
    de: "Preise ansehen",
    it: "Vedi prezzi",
    ru: "Тарифы",
    zh: "查看定价",
    ko: "요금 보기",
    ja: "料金を見る",
    ar: "عرض الأسعار",
    pt: "Ver preços"
  }),
  "alerts.step1Title": S("1. Link Telegram", {
    es: "1. Vincular Telegram",
    fr: "1. Lier Telegram",
    de: "1. Telegram verknüpfen",
    it: "1. Collega Telegram",
    ru: "1. Привязать Telegram",
    zh: "1. 绑定 Telegram",
    ko: "1. 텔레그램 연결",
    ja: "1. Telegramを連携",
    ar: "1. ربط تيليجرام",
    pt: "1. Ligar Telegram"
  }),
  "alerts.botEnvHint": S(
    "Set NEXT_PUBLIC_TELEGRAM_BOT_USERNAME on the frontend (Bot username without @).",
    {
      es: "Configura NEXT_PUBLIC_TELEGRAM_BOT_USERNAME en el frontend (usuario del bot sin @).",
      fr: "Définissez NEXT_PUBLIC_TELEGRAM_BOT_USERNAME sur le frontend (nom du bot sans @).",
      de: "NEXT_PUBLIC_TELEGRAM_BOT_USERNAME im Frontend setzen (Botname ohne @).",
      ru: "Задайте NEXT_PUBLIC_TELEGRAM_BOT_USERNAME на фронтенде (имя бота без @).",
      zh: "在前端设置 NEXT_PUBLIC_TELEGRAM_BOT_USERNAME（机器人用户名，不含 @）。",
      ko: "프론트엔드에 NEXT_PUBLIC_TELEGRAM_BOT_USERNAME 설정(@ 없이 봇 사용자명).",
      ja: "フロントにNEXT_PUBLIC_TELEGRAM_BOT_USERNAMEを設定（@なしのボット名）。",
      ar: "اضبط NEXT_PUBLIC_TELEGRAM_BOT_USERNAME في الواجهة (اسم البوت بدون @).",
      pt: "Defina NEXT_PUBLIC_TELEGRAM_BOT_USERNAME no frontend (nome do bot sem @)."
    }
  ),
  "alerts.widgetHint": S(
    "Use the official widget below (same bot as Sentinel). We never ask for your Telegram password.",
    {
      es: "Usa el widget oficial abajo (mismo bot que Sentinel). Nunca pedimos tu contraseña de Telegram.",
      fr: "Utilisez le widget officiel ci-dessous (même bot que Sentinel). Nous ne demandons jamais votre mot de passe Telegram.",
      de: "Nutzen Sie das offizielle Widget unten (gleicher Bot wie Sentinel). Wir fragen nie nach Ihrem Telegram-Passwort.",
      it: "Usa il widget ufficiale sotto (stesso bot di Sentinel). Non chiediamo mai la password Telegram.",
      ru: "Используйте официальный виджет ниже (тот же бот, что и Sentinel). Мы никогда не просим пароль Telegram.",
      zh: "使用下方官方小组件（与 Sentinel 同一机器人）。我们从不索要 Telegram 密码。",
      ko: "아래 공식 위젯을 사용하세요(Sentinel과 동일 봇). 텔레그램 비밀번호는 요청하지 않습니다.",
      ja: "下の公式ウィジェットを使用（Sentinelと同じボット）。Telegramのパスワードは求めません。",
      ar: "استخدم الأداة الرسمية أدناه (نفس بوت Sentinel). لا نطلب كلمة مرور تيليجرام.",
      pt: "Use o widget oficial abaixo (mesmo bot que o Sentinel). Nunca pedimos a palavra-passe do Telegram."
    }
  ),
  "alerts.linkedPrefix": S("Linked", {
    es: "Vinculado",
    fr: "Lié",
    de: "Verknüpft",
    it: "Collegato",
    ru: "Привязано",
    zh: "已绑定",
    ko: "연결됨",
    ja: "連携済み",
    ar: "مرتبط",
    pt: "Ligado"
  }),
  "alerts.step2Title": S("2. Deliveries", {
    es: "2. Envíos",
    fr: "2. Livraisons",
    de: "2. Zustellung",
    it: "2. Consegne",
    ru: "2. Доставка",
    zh: "2. 投递",
    ko: "2. 전달",
    ja: "2. 配信",
    ar: "2. التسليم",
    pt: "2. Entregas"
  }),
  "alerts.saving": S("Saving…", {
    es: "Guardando…",
    fr: "Enregistrement…",
    de: "Speichern…",
    it: "Salvataggio…",
    ru: "Сохранение…",
    zh: "保存中…",
    ko: "저장 중…",
    ja: "保存中…",
    ar: "جاري الحفظ…",
    pt: "A guardar…"
  }),
  "alerts.alertsOnBtn": S("Alerts: ON", {
    es: "Alertas: ON",
    fr: "Alertes : ON",
    de: "Alerts: AN",
    ru: "Оповещения: вкл.",
    zh: "提醒：开",
    ko: "알림: 켜짐",
    ja: "アラート：オン",
    ar: "التنبيهات: تشغيل",
    pt: "Alertas: ON"
  }),
  "alerts.alertsOffBtn": S("Alerts: OFF", {
    es: "Alertas: OFF",
    fr: "Alertes : OFF",
    de: "Alerts: AUS",
    ru: "Оповещения: выкл.",
    zh: "提醒：关",
    ko: "알림: 꺼짐",
    ja: "アラート：オフ",
    ar: "التنبيهات: إيقاف",
    pt: "Alertas: OFF"
  }),
  "alerts.linkTelegramFirst": S("Link Telegram first.", {
    es: "Primero vincula Telegram.",
    fr: "Liez d’abord Telegram.",
    de: "Zuerst Telegram verknüpfen.",
    it: "Collega prima Telegram.",
    ru: "Сначала привяжите Telegram.",
    zh: "请先绑定 Telegram。",
    ko: "먼저 텔레그램을 연결하세요.",
    ja: "先にTelegramを連携してください。",
    ar: "اربط تيليجرام أولًا.",
    pt: "Ligue primeiro o Telegram."
  }),
  "alerts.step3Title": S("3. Sensitivity & direction", {
    es: "3. Sensibilidad y dirección",
    fr: "3. Sensibilité et direction",
    de: "3. Empfindlichkeit & Richtung",
    it: "3. Sensibilità e direzione",
    ru: "3. Чувствительность и направление",
    zh: "3. 灵敏度与方向",
    ko: "3. 민감도 및 방향",
    ja: "3. 感度と方向",
    ar: "3. الحساسية والاتجاه",
    pt: "3. Sensibilidade e direção"
  }),
  "alerts.sensitivityHelp": S(
    "Conservative = fewer pings (higher % move). Aggressive = more pings. Direction filters pump-only / dump-only if you want less noise.",
    {
      es: "Conservador = menos avisos (movimiento % más alto). Agresivo = más avisos. El filtro de dirección solo pumps/dumps si quieres menos ruido.",
      fr: "Prudent = moins de notifications (mouvement % plus élevé). Agressif = plus de notifications. Le filtre de direction limite pumps/dumps pour réduire le bruit.",
      de: "Konservativ = weniger Meldungen (höhere %-Bewegung). Aggressiv = mehr Meldungen. Richtungsfilter nur Pump/Dump bei weniger Rauschen.",
      it: "Conservativo = meno notifiche (movimento % più alto). Aggressivo = più notifiche. Filtro direzione solo pump/dump per meno rumore.",
      ru: "Консервативно — меньше уведомлений (больший % движения). Агрессивно — больше. Фильтр направления только памп/дамп для меньшего шума.",
      zh: "保守 = 更少提醒（波动%更高）。激进 = 更多。方向可筛仅涨/仅跌以减少噪音。",
      ko: "보수적 = 알림 적음(% 변동 큼). 공격적 = 알림 많음. 방향 필터로 펌프/덤프만 줄일 수 있음.",
      ja: "保守＝通知少なめ（変動%大）。積極＝通知多め。方向で上げ/下げのみに絞ってノイズ低減。",
      ar: "محافظ = إشعارات أقل (حركة % أعلى). عدواني = أكثر. اتجاه للتصفية صعود/هبوط فقط لتقليل الضوضاء.",
      pt: "Conservador = menos alertas (movimento % maior). Agressivo = mais. Filtro de direção só pumps/dumps para menos ruído."
    }
  ),
  "alerts.labelStrategy": S("Strategy", {
    es: "Estrategia",
    fr: "Stratégie",
    de: "Strategie",
    it: "Strategia",
    ru: "Стратегия",
    zh: "策略",
    ko: "전략",
    ja: "戦略",
    ar: "الاستراتيجية",
    pt: "Estratégia"
  }),
  "alerts.labelDirection": S("Direction filter", {
    es: "Filtro de dirección",
    fr: "Filtre de direction",
    de: "Richtungsfilter",
    it: "Filtro direzione",
    ru: "Фильтр направления",
    zh: "方向筛选",
    ko: "방향 필터",
    ja: "方向フィルター",
    ar: "مرشح الاتجاه",
    pt: "Filtro de direção"
  }),
  "alerts.directionAny": S("Any move", {
    es: "Cualquier movimiento",
    fr: "Tout mouvement",
    de: "Jede Bewegung",
    it: "Qualsiasi movimento",
    ru: "Любое движение",
    zh: "任意波动",
    ko: "모든 움직임",
    ja: "任意の動き",
    ar: "أي حركة",
    pt: "Qualquer movimento"
  }),
  "alerts.directionUp": S("Pumps only (↑)", {
    es: "Solo pumps (↑)",
    fr: "Pumps uniquement (↑)",
    de: "Nur Pumps (↑)",
    it: "Solo pump (↑)",
    ru: "Только пампы (↑)",
    zh: "仅上涨 (↑)",
    ko: "펌프만 (↑)",
    ja: "上げのみ (↑)",
    ar: "صعود فقط (↑)",
    pt: "Só pumps (↑)"
  }),
  "alerts.directionDown": S("Dumps only (↓)", {
    es: "Solo dumps (↓)",
    fr: "Dumps uniquement (↓)",
    de: "Nur Dumps (↓)",
    it: "Solo dump (↓)",
    ru: "Только дампы (↓)",
    zh: "仅下跌 (↓)",
    ko: "덤프만 (↓)",
    ja: "下げのみ (↓)",
    ar: "هبوط فقط (↓)",
    pt: "Só dumps (↓)"
  }),
  "alerts.resolvedLine": S("Resolved: ≥{{minMovePct}}% move · dedup ~{{dedupHours}}h per token", {
    es: "Resuelto: movimiento ≥{{minMovePct}}% · dedup ~{{dedupHours}}h por token",
    fr: "Résolu : mouvement ≥{{minMovePct}}% · dédup ~{{dedupHours}}h par jeton",
    de: "Gelöst: ≥{{minMovePct}}% Bewegung · Dedup ~{{dedupHours}}h pro Token",
    it: "Risolto: movimento ≥{{minMovePct}}% · dedup ~{{dedupHours}}h per token",
    ru: "Порог: движение ≥{{minMovePct}}% · дедуп ~{{dedupHours}}ч на токен",
    zh: "触发：波动 ≥{{minMovePct}}% · 每代币去重约 {{dedupHours}} 小时",
    ko: "기준: ≥{{minMovePct}}% 변동 · 토큰당 중복 제거 ~{{dedupHours}}시간",
    ja: "条件: ≥{{minMovePct}}% · トークンあたり重複除去 ~{{dedupHours}}h",
    ar: "المعتمد: حركة ≥{{minMovePct}}% · إزالة التكرار ~{{dedupHours}}س لكل رمز",
    pt: "Resolvido: movimento ≥{{minMovePct}}% · dedup ~{{dedupHours}}h por token"
  }),
  "alerts.saveRules": S("Save rules", {
    es: "Guardar reglas",
    fr: "Enregistrer les règles",
    de: "Regeln speichern",
    it: "Salva regole",
    ru: "Сохранить правила",
    zh: "保存规则",
    ko: "규칙 저장",
    ja: "ルールを保存",
    ar: "حفظ القواعد",
    pt: "Guardar regras"
  }),
  "alerts.footerHint": S(
    "Add tokens to your watchlist from token pages — the backend polls DEX/market data on a schedule and deduplicates alerts per token.",
    {
      es: "Añade tokens al watchlist desde las páginas de token: el backend consulta datos DEX/mercado y deduplica alertas por token.",
      fr: "Ajoutez des jetons à la watchlist depuis les pages token — le backend interroge les données DEX/marché et déduplique les alertes par jeton.",
      de: "Tokens über Token-Seiten zur Watchlist hinzufügen — Backend pollt DEX/Marktdaten und dedupliziert Alerts pro Token.",
      it: "Aggiungi token alla watchlist dalle pagine token — il backend interroga DEX/mercato e deduplica per token.",
      ru: "Добавляйте токены в watchlist со страниц токенов — бэкенд опрашивает DEX/рынок и дедуплицирует оповещения по токену.",
      zh: "在代币页将代币加入自选 — 后端按计划轮询 DEX/行情并按代币去重提醒。",
      ko: "토큰 페이지에서 관심목록에 추가 — 백엔드가 DEX/시장 데이터를 주기적으로 조회하고 토큰별로 중복 제거합니다.",
      ja: "トークンページからウォッチリストに追加 — バックエンドがDEX/市場を定期取得しトークン単位で重複除去。",
      ar: "أضف رموزًا إلى قائمة المراقبة من صفحات الرموز — الخادم يجمع بيانات DEX/السوق ويزيل التكرار لكل رمز.",
      pt: "Adicione tokens à watchlist nas páginas de token — o backend consulta dados DEX/mercado e deduplica alertas por token."
    }
  ),
  "alerts.strategy.conservative": S("Conservative", {
    es: "Conservador",
    fr: "Prudent",
    de: "Konservativ",
    it: "Conservativo",
    ru: "Консервативно",
    zh: "保守",
    ko: "보수적",
    ja: "保守的",
    ar: "محافظ",
    pt: "Conservador"
  }),
  "alerts.strategy.balanced": S("Balanced", {
    es: "Equilibrado",
    fr: "Équilibré",
    de: "Ausgewogen",
    it: "Equilibrato",
    ru: "Сбалансированно",
    zh: "平衡",
    ko: "균형",
    ja: "バランス",
    ar: "متوازن",
    pt: "Equilibrado"
  }),
  "alerts.strategy.aggressive": S("Aggressive", {
    es: "Agresivo",
    fr: "Agressif",
    de: "Aggressiv",
    it: "Aggressivo",
    ru: "Агрессивно",
    zh: "激进",
    ko: "공격적",
    ja: "積極的",
    ar: "عدواني",
    pt: "Agressivo"
  }),
  "alerts.deliveryOrBrowser": S("Link Telegram or enable browser notifications below to turn alerts on.", {
    es: "Vincula Telegram o activa notificaciones del navegador abajo para encender las alertas.",
    fr: "Liez Telegram ou activez les notifications du navigateur ci-dessous pour activer les alertes.",
    de: "Verknüpfen Sie Telegram oder aktivieren Sie Browser-Benachrichtigungen unten.",
    it: "Collega Telegram o abilita le notifiche del browser sotto per attivare gli avvisi.",
    ru: "Привяжите Telegram или включите уведомления браузера ниже.",
    zh: "请绑定 Telegram 或先在下方开启浏览器通知以打开提醒。",
    ko: "Telegram을 연결하거나 아래에서 브라우저 알림을 켜세요.",
    ja: "Telegramを連携するか、下でブラウザ通知を有効にしてください。",
    ar: "اربط تيليجرام أو فعّل إشعارات المتصفح أدناه.",
    pt: "Ligue o Telegram ou ative notificações do browser abaixo."
  }),
  "alerts.browserSectionTitle": S("Browser push (tactical regime)", {
    es: "Push en el navegador (régimen táctico)",
    fr: "Notifications navigateur (régime d’exécution)",
    de: "Browser-Push (Ausführungs-Regime)",
    it: "Notifiche browser (regime di esecuzione)",
    ru: "Push в браузере (тактический режим)",
    zh: "浏览器推送（执行策略）",
    ko: "브라우저 푸시(전술적 레짐)",
    ja: "ブラウザ通知（執行レジーム）",
    ar: "دفع المتصفح (نظام التنفيذ)",
    pt: "Notificações do browser (regime tático)"
  }),
  "alerts.browserSectionBody": S(
    "Get execution-regime lines (BUY / SCALP / AVOID) in your browser, aligned with the cockpit. Requires HTTPS, permission, and VAPID on the server.",
    {
      es: "Recibe el régimen de ejecución (BUY / SCALP / AVOID) en el navegador, alineado con el cockpit. Requiere HTTPS, permiso y VAPID en el servidor.",
      fr: "Recevez le régime d’exécution dans le navigateur, aligné sur le cockpit. HTTPS, permission et VAPID requis côté serveur.",
      de: "Execution-Regime im Browser wie im Cockpit. HTTPS, Berechtigung und VAPID auf dem Server nötig.",
      it: "Righe di regime di esecuzione nel browser, allineate al cockpit. Servono HTTPS, permesso e VAPID lato server.",
      ru: "Сообщения о режиме исполнения в браузере, как в кокпите. Нужны HTTPS, разрешение и VAPID на сервере.",
      zh: "在浏览器接收与驾驶舱一致的交易策略。需要 HTTPS、用户授权和服务器 VAPID。",
      ko: "콕핏과 동일한 실행 레짐을 브라우저로 받습니다. HTTPS, 권한, 서버 VAPID가 필요합니다.",
      ja: "コックピットと同じ執行レジームをブラウザに。HTTPS・許可・サーバーのVAPIDが必要。",
      ar: "تنبيهات نظام التنفيذ في المتصفح مثل الـcockpit. يتطلب HTTPS وإذن وVAPID.",
      pt: "Linhas de regime de execução no browser, alinhadas com o cockpit. Requer HTTPS, permissão e VAPID no servidor."
    }
  ),
  "alerts.enableBrowserPush": S("Enable browser push", {
    es: "Activar push en el navegador",
    fr: "Activer le push navigateur",
    de: "Browser-Push aktivieren",
    it: "Abilita notifiche browser",
    ru: "Включить push в браузере",
    zh: "开启浏览器推送",
    ko: "브라우저 푸시 켜기",
    ja: "ブラウザ通知を有効に",
    ar: "تفعيل دفع المتصفح",
    pt: "Ativar notificações do browser"
  }),
  "alerts.disableBrowserPush": S("Remove browser device", {
    es: "Quitar este dispositivo",
    fr: "Retirer ce navigateur",
    de: "Diesen Browser entfernen",
    it: "Rimuovi questo dispositivo",
    ru: "Удалить подписку",
    zh: "移除此浏览器设备",
    ko: "이 브라우저 기기 제거",
    ja: "この端末の通知を止める",
    ar: "إزالة الجهاز من الإشعارات",
    pt: "Remover este dispositivo"
  }),
  "alerts.tacticalRegimeLabel": S("Tactical / execution regime alerts", {
    es: "Alertas de régimen de ejecución (táctico)",
    fr: "Alertes de régime d’exécution (tactique)",
    de: "Taktisches Ausführungs-Regime (Alerts)",
    it: "Avvisi regime di esecuzione (tattico)",
    ru: "Оповещения о тактическом / исполнительском режиме",
    zh: "战术/执行策略提醒",
    ko: "전술/실행 레짐 알림",
    ja: "戦術・執行レジーム通知",
    ar: "تنبيهات نظام التنفيذ التكتيكي",
    pt: "Alertas de regime tático de execução"
  }),
  "alerts.tacticalRegimeHelp": S("Optional digest for watchlist tokens (same logic as the token cockpit, not a trade signal).", {
    es: "Resumen opcional de tokens en watchlist (misma lógica que el cockpit, no es señal de trading).",
    fr: "Résumé optionnel des jetons en watchlist (même logique que le cockpit).",
    de: "Optional: Watchlist-Tokens (gleiche Logik wie Cockpit, kein Handelssignal).",
    it: "Digest opzionale sui token in watchlist (stessa logica del cockpit, non segnale di trade).",
    ru: "Опциональная выборка по watchlist (та же логика, что в кокпите; не сигнал).",
    zh: "对自选代币的可选摘要（与驾驶舱相同逻辑，非交易信号）。",
    ko: "관심목록 토큰 요약(콕핏과 동일, 매매 시그널 아님).",
    ja: "ウォッチリストの要約（コックピットと同ロジック、取引シグナルではありません）。",
    ar: "ملخص اختياري لرموز قائمة المراقبة (نفس منطق الـcockpit).",
    pt: "Resumo opcional da watchlist (mesma lógica do cockpit; não é sinal de trade)."
  }),
  "alerts.toast.pushEnabled": S("Browser push enabled for this device.", {
    es: "Push del navegador activado en este dispositivo.",
    fr: "Push navigateur activé sur cet appareil.",
    de: "Browser-Push auf diesem Gerät aktiviert.",
    it: "Notifiche browser abilitate su questo dispositivo.",
    ru: "Push в браузере включён на этом устройстве.",
    zh: "已在此设备开启浏览器推送。",
    ko: "이 기기에서 브라우저 푸시를 켰습니다.",
    ja: "この端末でブラウザ通知を有効にしました。",
    ar: "تم تفعيل دفع المتصفح على هذا الجهاز.",
    pt: "Notificações do browser ativadas neste dispositivo."
  }),
  "alerts.toast.pushDisabled": S("Browser push removed for this device.", {
    es: "Push del navegador desactivado en este dispositivo.",
    fr: "Push navigateur retiré sur cet appareil.",
    de: "Browser-Push auf diesem Gerät entfernt.",
    it: "Notifiche browser disattivate su questo dispositivo.",
    ru: "Подписка в браузере снята.",
    zh: "已移除此设备的浏览器推送。",
    ko: "이 기기의 브라우저 푸시를 해제했습니다.",
    ja: "この端末のブラウザ通知を停止しました。",
    ar: "أُزيلت إشعارات المتصفح من هذا الجهاز.",
    pt: "Notificações do browser removidas neste dispositivo."
  }),
  "alerts.toast.pushError": S("Browser push could not be updated. Check HTTPS, permission, and server VAPID.", {
    es: "No se pudo actualizar el push. HTTPS, permisos o VAPID en el servidor.",
    fr: "Mise à jour du push impossible. Vérifiez HTTPS, les permissions et le VAPID.",
    de: "Browser-Push fehlgeschlagen. HTTPS, Berechtigung, VAPID prüfen.",
    it: "Impossibile aggiornare il push. HTTPS, permessi, VAPID lato server.",
    ru: "Не удалось настроить push. Проверьте HTTPS, разрешение и VAPID.",
    zh: "无法更新浏览器推送。请检查 HTTPS、权限和服务器 VAPID。",
    ko: "브라우저 푸시를 바꾸지 못했습니다. HTTPS·권한·VAPID를 확인하세요.",
    ja: "ブラウザ通知を更新できませんでした。HTTPS・権限・VAPIDを確認してください。",
    ar: "تعذر تحديث دفع المتصفح. HTTPS والإذن وVAPID.",
    pt: "Não foi possível atualizar o push. Verifique HTTPS, permissão e VAPID no servidor."
  })
};

