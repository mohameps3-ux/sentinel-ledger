/**
 * Wayfinding strip: all locales resolve via S() (omitted codes fall back to English).
 * Kept separate from flatStrings.js for size and reviewability.
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
export const WAYFINDING_FLAT_STRINGS = {
  "wayfinding.youAreHere": S("You are here", {
    es: "Estás en",
    fr: "Vous êtes ici",
    de: "Sie sind hier",
    it: "Sei qui",
    ru: "Вы здесь",
    zh: "当前位置",
    ko: "현재 위치",
    ja: "現在地",
    ar: "أنت هنا",
    pt: "Você está em",
    nl: "Je bent hier",
    pl: "Jesteś tutaj",
    tr: "Buradasınız",
    hi: "आप यहाँ हैं",
    vi: "Bạn đang ở"
  }),
  "wayfinding.goTo": S("Go to", {
    es: "Ir a",
    fr: "Aller à",
    de: "Gehe zu",
    it: "Vai a",
    ru: "Перейти к",
    zh: "前往",
    ko: "이동",
    ja: "移動",
    ar: "انتقل إلى",
    pt: "Ir para",
    nl: "Ga naar",
    pl: "Przejdź do",
    tr: "Git",
    hi: "यहाँ जाएँ",
    vi: "Đi tới"
  }),
  "wayfinding.stayInFlow": S("Stay in flow:", {
    es: "Mantén el flujo:",
    fr: "Restez dans le flux :",
    de: "Bleiben Sie im Flow:",
    it: "Resta nel flusso:",
    ru: "Не теряйте ритм:",
    zh: "保持节奏：",
    ko: "흐름 유지:",
    ja: "フローを維持:",
    ar: "حافظ على الإيقاع:",
    pt: "Mantenha o fluxo:",
    nl: "Blijf in de flow:",
    pl: "Zachowaj płynność:",
    tr: "Akışta kalın:",
    hi: "प्रवाह में रहें:",
    vi: "Giữ nhịp:"
  }),
  "wayfinding.nextStep": S("Next suggested step:", {
    es: "Siguiente paso sugerido:",
    fr: "Prochaine étape suggérée :",
    de: "Nächster empfohlener Schritt:",
    it: "Passo successivo suggerito:",
    ru: "Следующий шаг:",
    zh: "建议下一步：",
    ko: "다음 권장 단계:",
    ja: "次の推奨ステップ:",
    ar: "الخطوة التالية المقترحة:",
    pt: "Próximo passo sugerido:",
    nl: "Volgende suggestie:",
    pl: "Sugerowany następny krok:",
    tr: "Önerilen sonraki adım:",
    hi: "अगला सुझाया गया कदम:",
    vi: "Bước tiếp theo gợi ý:"
  }),
  "wayfinding.jumpAria": S("Jump to any tool", {
    es: "Saltar a cualquier herramienta",
    fr: "Accéder à un outil",
    de: "Zu einem Tool springen",
    it: "Vai a uno strumento",
    ru: "Перейти к инструменту",
    zh: "跳转到任意工具",
    ko: "도구로 이동",
    ja: "ツールへジャンプ",
    ar: "انتقل إلى أي أداة",
    pt: "Ir para qualquer ferramenta",
    nl: "Spring naar een tool",
    pl: "Przejdź do narzędzia",
    tr: "Herhangi bir araca git",
    hi: "किसी भी टूल पर जाएँ",
    vi: "Chuyển tới công cụ"
  }),

  "wayfinding.fomo.0": S(
    "The live strip above keeps moving — refresh or you only see a snapshot.",
    {
      es: "La franja en vivo no para — recarga o solo verás una foto fija.",
      fr: "La bande live bouge en continu — actualisez ou vous ne voyez qu’un instantané.",
      de: "Der Live-Streifen bewegt sich — aktualisieren Sie, sonst nur ein Standbild.",
      it: "La striscia live si aggiorna — ricarica o vedi solo un’istantanea.",
      ru: "Живая полоса меняется — обновите страницу, иначе увидите снимок.",
      zh: "上方实时条会持续变化 — 请刷新，否则只是快照。",
      ko: "상단 라이브 줄은 계속 바뀝니다 — 새로고침하지 않으면 스냅샷만 보입니다.",
      ja: "上のライブ帯は動き続けます — 更新しないとスナップショットのままです。",
      ar: "الشريط الحي أعلاه يتحرك — حدّث وإلا ترى لقطة فقط.",
      pt: "A faixa ao vivo muda — atualize ou verá só um instantâneo."
    }
  ),
  "wayfinding.fomo.1": S(
    "Next wallet cluster pass may surface a new ENTER before you come back.",
    {
      es: "El próximo barrido de clusters puede sacar un ENTER antes de que vuelvas.",
      fr: "Le prochain passage de clusters peut révéler un nouvel ENTER avant votre retour.",
      de: "Der nächste Wallet-Cluster-Durchlauf kann ein neues ENTER zeigen, bevor Sie zurück sind.",
      it: "Il prossimo passaggio cluster può mostrare un nuovo ENTER prima del tuo ritorno.",
      ru: "Следующий проход по кластерам может показать новый ENTER до вашего возврата.",
      zh: "下一轮钱包簇扫描可能在你返回前出现新的入场信号。",
      ko: "다음 클러스터 패스에서 돌아오기 전 새 ENTER가 뜰 수 있습니다.",
      ja: "次のクラスター走査で戻る前に新しいENTERが出ることがあります。",
      ar: "قد يمر المسح التالي للعناقيد ويظهر ENTER جديد قبل عودتك.",
      pt: "A próxima varredura de clusters pode mostrar um ENTER novo antes de você voltar."
    }
  ),
  "wayfinding.fomo.2": S(
    "If you leave now, you miss the countdown on open entry windows.",
    {
      es: "Si te vas ahora, pierdes la cuenta atrás de las ventanas de entrada abiertas.",
      fr: "Si vous partez maintenant, vous manquez le compte à rebours des fenêtres d’entrée.",
      de: "Wenn Sie jetzt gehen, verpassen Sie den Countdown offener Einstiegsfenster.",
      it: "Se esci ora, perdi il conto alla rovescia sulle finestre di ingresso aperte.",
      ru: "Если уйдёте сейчас — пропустите отсчёт по открытым окнам входа.",
      zh: "若现在离开，会错过开放入场窗口的倒计时。",
      ko: "지금 나가면 열린 진입 창의 카운트다운을 놓칩니다.",
      ja: "今離れると、開いているエントリー枠のカウントダウンを逃します。",
      ar: "إن غادرت الآن ستفوت العد التنازلي لنوافذ الدخول المفتوحة.",
      pt: "Se sair agora, perde a contagem regressiva das janelas de entrada abertas."
    }
  ),
  "wayfinding.fomo.3": S(
    "Smart-money ranks reorder as 24h PnL updates — stale view = stale decisions.",
    {
      es: "Los rankings de smart money se reordenan con el PnL 24h — vista vieja, decisión vieja.",
      fr: "Les classements smart-money se réordonnent avec le PnL 24h — vue obsolète = décision obsolète.",
      de: "Smart-Money-Rankings ändern sich mit 24h-PnL — veraltete Ansicht, veraltete Entscheidung.",
      it: "Le classifiche smart-money si riordinano col PnL 24h — vista vecchia = decisione vecchia.",
      ru: "Рейтинги smart money пересчитываются с PnL за 24ч — устаревший вид = устаревшее решение.",
      zh: "聪明钱排名随24小时盈亏重排 — 视图旧则判断旧。",
      ko: "24시간 손익으로 스마트 머니 순위가 바뀝니다 — 오래된 화면은 오래된 판단입니다.",
      ja: "24時間PnLでスマートマネー順位が入れ替わります — 古い画面は古い判断。",
      ar: "ترتيب أموال الأذكياء يتغير مع تحديثات ربح 24س — عرض قديم = قرار قديم.",
      pt: "Os rankings de smart money mudam com o PnL 24h — visão velha = decisão velha."
    }
  ),

  "wayfinding.places.home.title": S("Home", {
    es: "Inicio",
    fr: "Accueil",
    de: "Start",
    it: "Home",
    ru: "Главная",
    zh: "首页",
    ko: "홈",
    ja: "ホーム",
    ar: "الرئيسية",
    pt: "Início"
  }),
  "wayfinding.places.home.detail": S("Decision feed, scan, NLU bar", {
    es: "Feed de decisión, escáner y barra NLU",
    fr: "Fil de décision, scan, barre NLU",
    de: "Entscheidungs-Feed, Scan, NLU-Leiste",
    it: "Feed decisioni, scansione, barra NLU",
    ru: "Лента решений, сканер, панель NLU",
    zh: "决策流、扫描、NLU 栏",
    ko: "결정 피드, 스캔, NLU 바",
    ja: "意思決定フィード・スキャン・NLUバー",
    ar: "تدفق القرار والمسح وشريط NLU",
    pt: "Feed de decisão, scan, barra NLU"
  }),
  "wayfinding.places.token.title": S("Token", {
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
  "wayfinding.places.token.detail": S("Single-mint terminal", {
    es: "Terminal de un único mint",
    fr: "Terminal mono-mint",
    de: "Einzel-Mint-Terminal",
    it: "Terminale singolo mint",
    ru: "Терминал одного mint",
    zh: "单币种终端",
    ko: "단일 민트 터미널",
    ja: "単一ミント端末",
    ar: "طرفية رمز واحد",
    pt: "Terminal de mint único"
  }),
  "wayfinding.places.wallet.title": S("Wallet profile", {
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
  "wayfinding.places.wallet.detail": S("Summary + narrative", {
    es: "Resumen y narrativa",
    fr: "Résumé + récit",
    de: "Zusammenfassung + Erzählung",
    it: "Riassunto + narrativa",
    ru: "Сводка + нарратив",
    zh: "摘要与叙事",
    ko: "요약 + 내러티브",
    ja: "要約とナラティブ",
    ar: "ملخص وسرد",
    pt: "Resumo + narrativa"
  }),
  "wayfinding.places.scanner.title": S("Scanner", {
    es: "Escáner",
    fr: "Scanner",
    de: "Scanner",
    it: "Scanner",
    ru: "Сканер",
    zh: "扫描器",
    ko: "스캐너",
    ja: "スキャナ",
    ar: "الماسح",
    pt: "Scanner"
  }),
  "wayfinding.places.scanner.detail": S("Paste a mint to open token", {
    es: "Pega un mint y abre el token",
    fr: "Collez un mint pour ouvrir le jeton",
    de: "Mint einfügen, um Token zu öffnen",
    it: "Incolla un mint per aprire il token",
    ru: "Вставьте mint, чтобы открыть токен",
    zh: "粘贴 mint 打开代币",
    ko: "민트를 붙여넣어 토큰 열기",
    ja: "ミントを貼り付けてトークンを開く",
    ar: "الصق mint لفتح الرمز",
    pt: "Cole um mint para abrir o token"
  }),
  "wayfinding.places.smartMoney.title": S("Smart money", {
    es: "Smart money",
    fr: "Smart money",
    de: "Smart Money",
    it: "Smart money",
    ru: "Smart money",
    zh: "聪明钱",
    ko: "스마트 머니",
    ja: "スマートマネー",
    ar: "الأموال الذكية",
    pt: "Smart money"
  }),
  "wayfinding.places.smartMoney.detail": S("Leaderboard + wallet links", {
    es: "Ranking y enlaces a wallets",
    fr: "Classement + liens wallets",
    de: "Rangliste + Wallet-Links",
    it: "Classifica + link ai wallet",
    ru: "Таблица лидеров + ссылки на кошельки",
    zh: "排行榜与钱包链接",
    ko: "리더보드 + 지갑 링크",
    ja: "リーダーボードとウォレットリンク",
    ar: "لوحة الصدارة وروابط المحافظ",
    pt: "Ranking + links de carteiras"
  }),
  "wayfinding.places.results.title": S("Results", {
    es: "Resultados",
    fr: "Résultats",
    de: "Ergebnisse",
    it: "Risultati",
    ru: "Результаты",
    zh: "结果",
    ko: "결과",
    ja: "結果",
    ar: "النتائج",
    pt: "Resultados"
  }),
  "wayfinding.places.results.detail": S("Saved outcomes", {
    es: "Outcomes guardados",
    fr: "Résultats enregistrés",
    de: "Gespeicherte Outcomes",
    it: "Esiti salvati",
    ru: "Сохранённые исходы",
    zh: "已保存结果",
    ko: "저장된 결과",
    ja: "保存されたアウトカム",
    ar: "نتائج محفوظة",
    pt: "Resultados guardados"
  }),
  "wayfinding.places.compare.title": S("Compare", {
    es: "Comparar",
    fr: "Comparer",
    de: "Vergleichen",
    it: "Confronta",
    ru: "Сравнение",
    zh: "对比",
    ko: "비교",
    ja: "比較",
    ar: "مقارنة",
    pt: "Comparar"
  }),
  "wayfinding.places.compare.detail": S("Two tokens side by side", {
    es: "Dos tokens lado a lado",
    fr: "Deux jetons côte à côte",
    de: "Zwei Token nebeneinander",
    it: "Due token affiancati",
    ru: "Два токена рядом",
    zh: "两个代币并排",
    ko: "두 토큰 나란히",
    ja: "2トークンを並べて表示",
    ar: "رمزان جنبًا إلى جنب",
    pt: "Dois tokens lado a lado"
  }),
  "wayfinding.places.watchlist.title": S("Watchlist", {
    es: "Watchlist",
    fr: "Watchlist",
    de: "Watchlist",
    it: "Watchlist",
    ru: "Список наблюдения",
    zh: "自选",
    ko: "관심목록",
    ja: "ウォッチリスト",
    ar: "قائمة المراقبة",
    pt: "Watchlist"
  }),
  "wayfinding.places.watchlist.detail": S("Tokens you track", {
    es: "Tokens que sigues",
    fr: "Jetons suivis",
    de: "Tokens, die Sie verfolgen",
    it: "Token che segui",
    ru: "Токены, за которыми следите",
    zh: "你跟踪的代币",
    ko: "추적 중인 토큰",
    ja: "追跡中のトークン",
    ar: "الرموز التي تتابعها",
    pt: "Tokens que acompanha"
  }),
  "wayfinding.places.portfolio.title": S("Portfolio", {
    es: "Cartera",
    fr: "Portefeuille",
    de: "Portfolio",
    it: "Portafoglio",
    ru: "Портфель",
    zh: "投资组合",
    ko: "포트폴리오",
    ja: "ポートフォリオ",
    ar: "المحفظة",
    pt: "Carteira"
  }),
  "wayfinding.places.portfolio.detail": S("Watchlist markets", {
    es: "Mercados de tu watchlist",
    fr: "Marchés de la watchlist",
    de: "Watchlist-Märkte",
    it: "Mercati della watchlist",
    ru: "Рынки по watchlist",
    zh: "自选市场",
    ko: "관심목록 시장",
    ja: "ウォッチリストの市場",
    ar: "أسواق قائمة المراقبة",
    pt: "Mercados da watchlist"
  }),
  "wayfinding.places.alerts.title": S("Alerts", {
    es: "Alertas",
    fr: "Alertes",
    de: "Alerts",
    it: "Avvisi",
    ru: "Оповещения",
    zh: "提醒",
    ko: "알림",
    ja: "アラート",
    ar: "التنبيهات",
    pt: "Alertas"
  }),
  "wayfinding.places.alerts.detail": S("Notifications setup", {
    es: "Configuración de avisos",
    fr: "Configuration des notifications",
    de: "Benachrichtigungen einrichten",
    it: "Impostazione notifiche",
    ru: "Настройка уведомлений",
    zh: "通知设置",
    ko: "알림 설정",
    ja: "通知の設定",
    ar: "إعداد الإشعارات",
    pt: "Configuração de alertas"
  }),
  "wayfinding.places.pricing.title": S("Pricing", {
    es: "Precios",
    fr: "Tarifs",
    de: "Preise",
    it: "Prezzi",
    ru: "Тарифы",
    zh: "定价",
    ko: "가격",
    ja: "料金",
    ar: "الأسعار",
    pt: "Preços"
  }),
  "wayfinding.places.pricing.detail": S("Upgrade path", {
    es: "Mejora a PRO",
    fr: "Passage PRO",
    de: "Upgrade-Pfad",
    it: "Percorso upgrade",
    ru: "Путь апгрейда",
    zh: "升级路径",
    ko: "업그레이드 경로",
    ja: "アップグレード",
    ar: "مسار الترقية",
    pt: "Caminho de upgrade"
  }),
  "wayfinding.places.graveyard.title": S("Graveyard", {
    es: "Cementerio",
    fr: "Cimetière",
    de: "Friedhof",
    it: "Cimitero",
    ru: "Кладбище",
    zh: "墓地",
    ko: "무덤",
    ja: "墓場",
    ar: "المقبرة",
    pt: "Cemitério"
  }),
  "wayfinding.places.graveyard.detail": S("Dead / rugged archive", {
    es: "Archivo de tokens muertos / rug",
    fr: "Archive tokens morts / rug",
    de: "Archiv toter / rug-Pull-Tokens",
    it: "Archivio token morti / rug",
    ru: "Архив мёртвых / rug-токенов",
    zh: "失效 / 跑路归档",
    ko: "사망·럭풀 아카이브",
    ja: "死亡・ラグのアーカイブ",
    ar: "أرشيف الرموز الميتة/المسحوبة",
    pt: "Arquivo de tokens mortos / rug"
  }),
  "wayfinding.places.stalker.title": S("Wallet stalker", {
    es: "Wallet stalker",
    fr: "Wallet stalker",
    de: "Wallet-Stalker",
    it: "Wallet stalker",
    ru: "Сталкер кошельков",
    zh: "钱包跟踪",
    ko: "지갑 스토커",
    ja: "ウォレットストーカー",
    ar: "مُراقب المحافظ",
    pt: "Wallet stalker"
  }),
  "wayfinding.places.stalker.detail": S("Follow wallets", {
    es: "Sigue wallets",
    fr: "Suivre des wallets",
    de: "Wallets folgen",
    it: "Segui i wallet",
    ru: "Следить за кошельками",
    zh: "跟踪钱包",
    ko: "지갑 팔로우",
    ja: "ウォレットを追跡",
    ar: "تتبع المحافظ",
    pt: "Seguir carteiras"
  }),
  "wayfinding.places.ops.title": S("Ops", {
    es: "Ops",
    fr: "Ops",
    de: "Ops",
    it: "Ops",
    ru: "Операции",
    zh: "运维",
    ko: "운영",
    ja: "運用",
    ar: "العمليات",
    pt: "Ops"
  }),
  "wayfinding.places.ops.detail": S("Status + tools", {
    es: "Estado y herramientas",
    fr: "Statut + outils",
    de: "Status + Tools",
    it: "Stato + strumenti",
    ru: "Статус и инструменты",
    zh: "状态与工具",
    ko: "상태 + 도구",
    ja: "ステータスとツール",
    ar: "الحالة والأدوات",
    pt: "Estado + ferramentas"
  }),
  "wayfinding.places.legal.title": S("Legal / contact", {
    es: "Legal / contacto",
    fr: "Légal / contact",
    de: "Rechtliches / Kontakt",
    it: "Legale / contatto",
    ru: "Правовая информация / контакт",
    zh: "法律 / 联系",
    ko: "법적 고지 / 문의",
    ja: "法務・お問い合わせ",
    ar: "قانوني / اتصال",
    pt: "Legal / contacto"
  }),
  "wayfinding.places.legal.detail": S("Policies + support", {
    es: "Políticas y soporte",
    fr: "Politiques + support",
    de: "Richtlinien + Support",
    it: "Policy + supporto",
    ru: "Политики и поддержка",
    zh: "政策与支持",
    ko: "정책 및 지원",
    ja: "ポリシーとサポート",
    ar: "السياسات والدعم",
    pt: "Políticas + suporte"
  }),
  "wayfinding.places.unknown.title": S("Sentinel", {
    es: "Sentinel",
    fr: "Sentinel",
    de: "Sentinel",
    it: "Sentinel",
    ru: "Sentinel",
    zh: "Sentinel",
    ko: "Sentinel",
    ja: "Sentinel",
    ar: "Sentinel",
    pt: "Sentinel"
  }),
  "wayfinding.places.unknown.detail": S("Use the links below to switch screen", {
    es: "Usa los enlaces para cambiar de pantalla",
    fr: "Utilisez les liens ci-dessous pour changer d’écran",
    de: "Nutzen Sie die Links unten, um die Ansicht zu wechseln",
    it: "Usa i link sotto per cambiare schermata",
    ru: "Используйте ссылки ниже для перехода",
    zh: "使用下方链接切换界面",
    ko: "아래 링크로 화면 전환",
    ja: "下のリンクで画面を切り替え",
    ar: "استخدم الروابط أدناه للتنقل",
    pt: "Use os links abaixo para mudar de ecrã"
  }),

  "wayfinding.links.home": S("Home", {
    es: "Inicio",
    fr: "Accueil",
    de: "Start",
    it: "Home",
    ru: "Главная",
    zh: "首页",
    ko: "홈",
    ja: "ホーム",
    ar: "الرئيسية",
    pt: "Início"
  }),
  "wayfinding.links.homeDesc": S("Feed + scan", {
    es: "Feed y escáner",
    fr: "Fil + scan",
    de: "Feed + Scan",
    it: "Feed + scan",
    ru: "Лента + сканер",
    zh: "信息流 + 扫描",
    ko: "피드 + 스캔",
    ja: "フィード＋スキャン",
    ar: "التدفق + المسح",
    pt: "Feed + scan"
  }),
  "wayfinding.links.scanner": S("Scanner", {
    es: "Escáner",
    fr: "Scanner",
    de: "Scanner",
    it: "Scanner",
    ru: "Сканер",
    zh: "扫描器",
    ko: "스캐너",
    ja: "スキャナ",
    ar: "الماسح",
    pt: "Scanner"
  }),
  "wayfinding.links.scannerDesc": S("Mint lookup", {
    es: "Buscar mint",
    fr: "Recherche mint",
    de: "Mint-Suche",
    it: "Ricerca mint",
    ru: "Поиск mint",
    zh: "查找 mint",
    ko: "민트 조회",
    ja: "ミント検索",
    ar: "بحث عن mint",
    pt: "Pesquisa de mint"
  }),
  "wayfinding.links.smartMoney": S("Smart money", {
    es: "Smart money",
    fr: "Smart money",
    de: "Smart Money",
    it: "Smart money",
    ru: "Smart money",
    zh: "聪明钱",
    ko: "스마트 머니",
    ja: "スマートマネー",
    ar: "الأموال الذكية",
    pt: "Smart money"
  }),
  "wayfinding.links.smartMoneyDesc": S("Wallets + edge", {
    es: "Wallets y edge",
    fr: "Wallets + edge",
    de: "Wallets + Edge",
    it: "Wallet + edge",
    ru: "Кошельки и преимущество",
    zh: "钱包与优势",
    ko: "지갑 + 엣지",
    ja: "ウォレット＋エッジ",
    ar: "محافظ وميزة",
    pt: "Carteiras + edge"
  }),
  "wayfinding.links.watchlist": S("Watchlist", {
    es: "Watchlist",
    fr: "Watchlist",
    de: "Watchlist",
    it: "Watchlist",
    ru: "Список наблюдения",
    zh: "自选",
    ko: "관심목록",
    ja: "ウォッチリスト",
    ar: "قائمة المراقبة",
    pt: "Watchlist"
  }),
  "wayfinding.links.watchlistDesc": S("Your tokens", {
    es: "Tus tokens",
    fr: "Vos jetons",
    de: "Ihre Tokens",
    it: "I tuoi token",
    ru: "Ваши токены",
    zh: "你的代币",
    ko: "내 토큰",
    ja: "あなたのトークン",
    ar: "رموزك",
    pt: "Os seus tokens"
  }),
  "wayfinding.links.alerts": S("Alerts", {
    es: "Alertas",
    fr: "Alertes",
    de: "Alerts",
    it: "Avvisi",
    ru: "Оповещения",
    zh: "提醒",
    ko: "알림",
    ja: "アラート",
    ar: "التنبيهات",
    pt: "Alertas"
  }),
  "wayfinding.links.alertsDesc": S("Telegram / PRO", {
    es: "Telegram / PRO",
    fr: "Telegram / PRO",
    de: "Telegram / PRO",
    it: "Telegram / PRO",
    ru: "Telegram / PRO",
    zh: "Telegram / PRO",
    ko: "Telegram / PRO",
    ja: "Telegram / PRO",
    ar: "Telegram / PRO",
    pt: "Telegram / PRO"
  }),
  "wayfinding.links.pricing": S("Pricing", {
    es: "Precios",
    fr: "Tarifs",
    de: "Preise",
    it: "Prezzi",
    ru: "Тарифы",
    zh: "定价",
    ko: "가격",
    ja: "料金",
    ar: "الأسعار",
    pt: "Preços"
  }),
  "wayfinding.links.pricingDesc": S("Plans", {
    es: "Planes",
    fr: "Plans",
    de: "Pläne",
    it: "Piani",
    ru: "Тарифы",
    zh: "方案",
    ko: "요금제",
    ja: "プラン",
    ar: "الخطط",
    pt: "Planos"
  }),
  "wayfinding.links.compare": S("Compare", {
    es: "Comparar",
    fr: "Comparer",
    de: "Vergleichen",
    it: "Confronta",
    ru: "Сравнить",
    zh: "对比",
    ko: "비교",
    ja: "比較",
    ar: "مقارنة",
    pt: "Comparar"
  }),
  "wayfinding.links.compareTitle": S("Side-by-side tokens", {
    es: "Tokens lado a lado",
    fr: "Jetons côte à côte",
    de: "Token nebeneinander",
    it: "Token affiancati",
    ru: "Токены рядом",
    zh: "代币并排对比",
    ko: "토큰 나란히 비교",
    ja: "トークンを並べて比較",
    ar: "رموز جنبًا إلى جنب",
    pt: "Tokens lado a lado"
  }),
  "wayfinding.links.portfolio": S("Portfolio", {
    es: "Cartera",
    fr: "Portefeuille",
    de: "Portfolio",
    it: "Portafoglio",
    ru: "Портфель",
    zh: "投资组合",
    ko: "포트폴리오",
    ja: "ポートフォリオ",
    ar: "المحفظة",
    pt: "Carteira"
  }),
  "wayfinding.links.portfolioTitle": S("Markets for watchlist", {
    es: "Mercados de la watchlist",
    fr: "Marchés pour la watchlist",
    de: "Märkte für die Watchlist",
    it: "Mercati per watchlist",
    ru: "Рынки для watchlist",
    zh: "自选对应市场",
    ko: "관심목록 시장",
    ja: "ウォッチリストの市場",
    ar: "أسواق قائمة المراقبة",
    pt: "Mercados da watchlist"
  }),

  "wayfinding.steps.smartMoney": S(
    "Open a wallet row for its profile (ES/EN narrative), or use Scanner if you already have a mint.",
    {
      es: "Abre la fila de una wallet para ver su perfil (narrativa ES/EN), o usa el Escáner si ya tienes un mint.",
      fr: "Ouvrez une ligne wallet pour son profil (récit ES/EN), ou le Scanner si vous avez déjà un mint.",
      de: "Öffnen Sie eine Wallet-Zeile für das Profil (ES/EN-Erzählung) oder den Scanner, wenn Sie bereits einen Mint haben.",
      it: "Apri una riga wallet per il profilo (narrativa ES/EN), o Scanner se hai già un mint.",
      ru: "Откройте строку кошелька для профиля (нарратив ES/EN) или Сканер, если уже есть mint.",
      zh: "打开钱包行查看档案（中/英叙事），若已有 mint 请用扫描器。",
      ko: "지갑 행을 열어 프로필(ES/EN 내러티브)을 보거나, 민트가 있으면 스캐너를 쓰세요.",
      ja: "ウォレット行を開いてプロフィール（日英ナラティブ）、mintがあるならスキャナへ。",
      ar: "افتح صف محفظة للملف (سرد ES/EN)، أو استخدم الماسح إن كان لديك mint.",
      pt: "Abra uma linha de carteira para o perfil (narrativa ES/EN), ou o Scanner se já tiver um mint."
    }
  ),
  "wayfinding.steps.scanner": S(
    "Paste a Solana mint (32–44 characters), then Analyze to open the full token terminal.",
    {
      es: "Pega un mint de Solana (32–44 caracteres) y pulsa Analyze para abrir el terminal del token.",
      fr: "Collez un mint Solana (32–44 caractères), puis Analyser pour ouvrir le terminal complet.",
      de: "Solana-Mint einfügen (32–44 Zeichen), dann Analysieren für das vollständige Token-Terminal.",
      it: "Incolla un mint Solana (32–44 caratteri), poi Analizza per aprire il terminale token.",
      ru: "Вставьте mint Solana (32–44 символа), затем Analyze для полного терминала токена.",
      zh: "粘贴 Solana mint（32–44 字符），点分析打开完整代币终端。",
      ko: "솔라나 민트(32–44자)를 붙여넣고 Analyze로 전체 토큰 터미널을 여세요.",
      ja: "Solanaミント（32〜44文字）を貼り付け、Analyzeでトークン端末を開く。",
      ar: "الصق mint سولانا (32–44 حرفًا) ثم Analyze لفتح طرفية الرمز الكاملة.",
      pt: "Cole um mint Solana (32–44 caracteres) e Analyze para abrir o terminal completo do token."
    }
  ),
  "wayfinding.steps.watchlist": S(
    "Add mints from Home or Scanner, then open Portfolio for watchlist markets or Compare for two tokens side by side.",
    {
      es: "Añade mints desde Inicio o el Escáner; luego abre Cartera para mercados o Comparar para dos tokens.",
      fr: "Ajoutez des mints depuis l’accueil ou le Scanner, puis Portefeuille pour les marchés ou Comparer pour deux jetons.",
      de: "Mints von Start oder Scanner hinzufügen, dann Portfolio für Märkte oder Vergleichen für zwei Token.",
      it: "Aggiungi mint da Home o Scanner, poi Portfolio per i mercati o Confronta per due token affiancati.",
      ru: "Добавьте mint с главной или сканера, затем Портфель для рынков или Сравнение для двух токенов.",
      zh: "从首页或扫描器添加 mint，再打开投资组合看自选市场，或对比两个代币。",
      ko: "홈 또는 스캐너에서 민트를 추가한 뒤, 포트폴리오로 시장을 보거나 비교로 두 토큰을 나란히 보세요.",
      ja: "ホームまたはスキャナでミントを追加し、ポートフォリオで市場か、比較で2トークンを並べて表示。",
      ar: "أضف mint من الرئيسية أو الماسح، ثم المحفظة لأسواق القائمة أو المقارنة لرمزين جنبًا إلى جنب.",
      pt: "Adicione mints na Home ou no Scanner; depois Carteira para mercados ou Comparar para dois tokens."
    }
  ),
  "wayfinding.steps.token": S(
    "Add this mint to Watchlist to track it, check Smart money for wallets in flow, or Compare it against another token.",
    {
      es: "Añade este mint a la Watchlist para seguirlo, mira Smart money por wallets activas o compáralo con otro token.",
      fr: "Ajoutez ce mint à la watchlist, consultez Smart money pour les wallets actifs, ou comparez à un autre jeton.",
      de: "Mint zur Watchlist hinzufügen, Smart Money für aktive Wallets prüfen oder mit einem anderen Token vergleichen.",
      it: "Aggiungi il mint alla watchlist, controlla Smart money per wallet attive o confrontalo con un altro token.",
      ru: "Добавьте mint в watchlist, посмотрите Smart money по активным кошелькам или сравните с другим токеном.",
      zh: "将此 mint 加入自选跟踪，在聪明钱中查看活跃钱包，或与其他代币对比。",
      ko: "이 민트를 관심목록에 추가하고, 스마트 머니에서 활성 지갑을 보거나 다른 토큰과 비교하세요.",
      ja: "このミントをウォッチリストに追加し、スマートマネーでアクティブウォレットを確認するか別トークンと比較。",
      ar: "أضف هذا الmint إلى قائمة المراقبة، راجع الأموال الذكية للمحافظ النشطة، أو قارنه برمز آخر.",
      pt: "Adicione este mint à watchlist, veja Smart money por carteiras ativas ou compare com outro token."
    }
  ),
  "wayfinding.steps.wallet": S(
    "Return to Smart money for the full leaderboard, or Scanner if you want to pivot to a specific mint.",
    {
      es: "Vuelve a Smart money para el ranking completo, o al Escáner si quieres saltar a un mint concreto.",
      fr: "Retournez à Smart money pour le classement complet, ou Scanner pour cibler un mint précis.",
      de: "Zurück zu Smart Money für die volle Rangliste, oder Scanner für einen bestimmten Mint.",
      it: "Torna a Smart money per la classifica completa, o Scanner per passare a un mint specifico.",
      ru: "Вернитесь в Smart money за полной таблицей или в Сканер для конкретного mint.",
      zh: "返回聪明钱查看完整榜单，或用扫描器跳转到指定 mint。",
      ko: "전체 순위는 스마트 머니로, 특정 민트로 전환하려면 스캐너로 가세요.",
      ja: "全体ランキングはスマートマネーへ、特定ミントへはスキャナへ。",
      ar: "ارجع إلى الأموال الذكية للترتيب الكامل، أو الماسح للانتقال إلى mint محدد.",
      pt: "Volte ao Smart money para o ranking completo, ou ao Scanner para um mint específico."
    }
  )
};
