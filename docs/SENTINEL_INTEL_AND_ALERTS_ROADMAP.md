# Sentinel Ledger — Intel de wallets, alertas y paneles (roadmap vivo)

Documento **positivo y accionable**: qué ya está en el repo, qué encaja con la visión de producto, y qué se apila **encima** sin reescribir la base.

---

## Resumen ejecutivo

| Área                         | Base actual (código)                                      | Próximo salto (sin romper MVP)                    |
|-----------------------------|------------------------------------------------------------|---------------------------------------------------|
| Smart money por token       | API + ranking on-chain + **tiers Elite/Active/Scout** + Birdeye opcional | Panel con strip competitivo; north-star ROI formula cuando quieras |
| Holders aggregate           | **Birdeye `holder` vía `token_overview`** si hay `BIRDEYE_API_KEY` | Sin key: muestra top10 + hint para activar Birdeye |
| Wallets / riesgo narrativo  | `walletSpamSignals` + banner + Telegram dedup              | Clusters, mixer automático, umbrales configurables |
| Alertas tiempo real         | Webhook Helius → Socket.IO + UI                           | Reglas de umbral (whale %, grade) + colas por tier |
| Telegram / X                | Grade A/A+ + link app; omni `channels: ["x"]`             | Suscripciones, latencia por tier, Discord/email   |
| Paneles token page          | Datos reales en la mayoría; Smart Money = señal heurística | `totalHolders` RPC; worker deployer más denso   |

---

## 1. Smart money (lo que ya tienes vs la fórmula “ideal”)

### Visión de producto (conversación)

```
walletScore = (ROI_30d * 0.4) + (win_rate * 0.3) + (avg_position_size * 0.2) + (recent_hits * 0.1)
```

Tiers sugeridos: ≥80 Tier 1, 60–79 Tier 2, &lt;60 oculto.

### Implementación actual (no sustituir; evolucionar)

- **Endpoint:** `GET /api/v1/smart-wallets/:address` (`backend/src/routes/smartWallets.js`).
- **Pipeline:** `smartMoneyService` → prioridad **on-chain** (`smartMoneyOnChain.js`: agregación de transfers Helius + holders grandes + score heurístico `scoreFromActivity`) → enriquecimiento **Birdeye** si hay `BIRDEYE_API_KEY`.
- **Fallback DB:** tablas `smart_wallets` / `smart_wallet_signals` si existen datos + opción `SMART_MONEY_DB_FALLBACK=true` para demos.
- **Frontend:** `useSmartMoney` llama a la API real; el panel muestra **señal on-chain**, no necesariamente la fórmula ROI/win_rate hasta que haya curación o oráculo de PnL universal.

**Conclusión positiva:** ya no dependes de “20 mocks fijos”; la base es **datos reales con heurística**. El siguiente paso es **mapear** el score de producto a campos normalizados (`tier`, `walletScore`) sin cambiar el fetch.

---

## 2. Wallets maliciosas / spam

### En código hoy

- `getWalletSpamIntel` + heurísticas en `walletSpamSignals.js` (muestras recientes, señales tipadas).
- Alertas Telegram **`sendWalletThreatAlert`** con Redis dedup.
- `riskEngine` + `onChainService` (mint/freeze, etc.) para la narrativa de riesgo del token.

### Encima de la base (roadmap)

| Idea conversación      | Estado código | Siguiente paso incremental                          |
|------------------------|---------------|-----------------------------------------------------|
| Rug en deployer        | Parcial vía datos deployer | Worker BullMQ + más fills en `deployer_history`   |
| Mixer Tornado          | Manual / flags si existen   | Pipeline Helius etiquetado + lista deny            |
| Clusters / Sybil       | No            | Detector por bloque / cantidades iguales (nuevo módulo) |
| Insider vs deployer    | Parcial       | Funding graph ligero o heurística de primer fondeo |

---

## 3. Sistema de alertas y tiers

### Ya montado

- **Helius webhook** → emisión por mint (`heliusWebhook.js`).
- **Socket.IO** salas por token (`join-token`).
- **Telegram:** alertas de grade alto + enlace app; wallet threat; broadcast omni.
- **X:** post en grade A/A+ si `TWITTER_*` está configurado; omni `channels` incluye `"x"`.

### Encima de la base (monetización / retención)

- Tabla o servicio de **tier de usuario** (Free / Pro / Super Pro / API).
- **Cola + delay** por tier antes de `emit` o antes de enviar Telegram (latencia escalonada).
- **Preferencias de usuario** (liquidez mínima, grades mínimos, mints bloqueados) en Supabase.
- **Push web / Discord / email:** nuevos adaptadores al lado de `omniAlertsService`, misma forma que `x`.

No hace falta reescribir Helius ni Socket.IO: solo **capa de política** entre evento y entrega.

---

## 4. Paneles desplegables (token page)

| Panel              | Rol                         | Base actual                         | Mejora siguiente                          |
|--------------------|-----------------------------|-------------------------------------|-------------------------------------------|
| Hero + stats strip | Contexto y KPIs           | Datos API                           | Más KPIs si el backend los expone         |
| Decision           | Grade / pros-cons         | `riskEngine`                        | —                                         |
| Chart              | DexScreener                 | iframe                              | —                                         |
| Momentum           | Vol / change / Liq        | `market`                            | —                                         |
| Holders            | Top10 %, holders          | On-chain parcial                    | **`totalHolders`** vía RPC/supply       |
| Deployer           | Historial creador         | Servicio + DB                     | Worker más frecuente + backfill           |
| Live flow          | Swaps live                  | WS + Helius                         | Umbrales “whale” en UI o backend          |
| Smart money        | Wallets activas en el mint | **API real** + heurística + Birdeye | Etiquetas Tier + copy que explique señal |

---

## 5. Prioridades recomendadas (orden, solo positivo)

1. **Explicabilidad Smart Money** — copy en UI + campo `meta.explanation` estable (sin cambiar ranking).
2. **`totalHolders` real** — una función en `onChainService`, mismo contrato del panel.
3. **Política de alertas** — tabla `user_alert_prefs` + aplicar filtros antes de Telegram.
4. **Tier + delay** — middleware de cola (BullMQ o Redis ZSET) por plan.
5. **Clusters** — nuevo servicio pequeño leyendo el mismo cache Helius que ya usas.
6. **Discord / email** — mismo patrón que `postMarketingTweet`.

---

## 6. Cómo usar esto en Cursor

- Pide tareas **referenciando este archivo** y un ID de fila (ej. “implementa fila 2 de §5”).
- No pidas “rehacer Sentinel”; pide **“capa sobre `heliusWebhook` / `omniAlertsService`”**.

---

*Última alineación con repo: incluye API smart-wallets, on-chain smart money, marketing X+TG, y omni X. La fórmula ROI/win_rate del doc original es la **north star**; el scoring on-chain actual es la **implementación v1**.*
