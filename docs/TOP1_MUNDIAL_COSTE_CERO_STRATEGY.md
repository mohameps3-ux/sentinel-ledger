# Sentinel Ledger — Propuesta estratégica "Top 1 mundial" a coste EUR0

## Diagnóstico competitivo (hueco real)

- **Bullx / Photon / Trojan**: fuertes en ejecución/copy-trading, débiles en análisis profundo y explicabilidad de wallets.
- **Cielo Finance**: tracking superficial de PnL, poca separación entre suerte y habilidad, sin detección sólida de manipulación.
- **Nansen**: fuerte en EVM, más débil en Solana nativo; pricing alto.
- **Arkham**: orientado a forensics/compliance, UX menos enfocada a trader retail.

**Oportunidad central**:
combinar **(1) señal verificable**, **(2) explicabilidad humana**, **(3) onboarding sin fricción** y **(4) Solana-first con latencia <5s**.

---

## TIER 1 — Quick wins (1-3 días c/u)

1. **Confidence Score explicable por wallet**  
   Score 0-100 con desglose: `win_rate`, `hold_time_median`, `buy_before_pump_ratio`, `rug_avoidance_rate`, `cluster_independence`.

2. **"Why this wallet?" narrativo (sin LLM)**  
   2-3 frases automáticas por wallet usando plantillas y datos propios.

3. **Rug Radar preventivo inline**  
   Semáforo verde/ámbar/rojo con checks de LP lock, mint authority, freeze authority y concentración top holders.

---

## TIER 2 — Medium (1-2 semanas c/u)

4. **Cluster detection** para detectar coordinación/wash patterns.
5. **Alpha Decay Tracker** para detectar pérdida de edge por wallet.
6. **Simulación honesta de copy-portfolio** con slippage/fees/delay realista.
7. **Widget embebible público** para distribución orgánica.

---

## TIER 3 — Moat builders (1 mes+)

8. **Reputation-weighted consensus signals** (agregación ponderada de smart wallets).
9. **Guest Trial 24h sin wallet/email** con límites por IP/fingerprint.
10. **Public Proof-of-Track-Record** con timestamp/hash on-chain.

---

## Orden recomendado de ejecución

1) Feature 2 (`Why this wallet`)  
2) Feature 1 (Confidence score)  
3) Feature 3 (Rug radar)  
4) Feature 9 (Guest trial)  
5) Feature 6 (Simulación honesta)  
6) Feature 7 (Widget embebible)  
7) Feature 8 + 10 (moat defensible)  
8) Feature 4 + 5 (mes 2 con más volumen)

---

## Plan técnico propuesto para empezar hoy (Feature 2: "Why this wallet?")

### Arquitectura mínima

- **Backend nuevo**:
  - `backend/src/services/walletNarrative.js`
  - `backend/src/routes/walletNarrative.js`
- **Backend update**:
  - `backend/src/server.js` (registrar ruta)
  - opcional: `backend/src/services/smartMoneyService.js` (adjuntar `narrative`)
- **Frontend nuevo**:
  - `frontend/components/WalletNarrativeCard.jsx`
  - `frontend/lib/api/walletNarrative.js`
- **Frontend update**:
  - `frontend/pages/smart-money.js` (render card)
  - `frontend/pages/wallet/[address]` (si existe, bloque destacado)

### Endpoint

- `GET /api/v1/wallets/:address/narrative?lang=es|en`

Respuesta esperada:

```json
{
  "address": "9WzD...xFg",
  "narrative": {
    "headline": "Sniper de lanzamientos con disciplina",
    "sentences": [
      "Esta wallet compró BONK 4h antes del pump del 340%.",
      "Mantiene posiciones 2.3 días de media — no es un bot.",
      "Nunca ha tocado un token que luego resultó ser rug (0/47)."
    ],
    "highlight_tags": ["early_buyer", "patient_holder", "rug_avoider"],
    "generated_at": "2026-04-19T21:45:00Z"
  },
  "cached": true
}
```

### Cache y performance

- Redis key: `narrative:v1:{address}`
- TTL: **30 minutos**
- Coste: EUR0 (plantillas deterministas, sin LLM)

### Señales candidatas para narrativa

- `biggest_win`
- `early_buyer_of_pump`
- `median_hold_time`
- `win_rate_30d`
- `rug_avoidance`
- `diversification`
- `recent_activity_spike`
- (`cluster_independence` como placeholder v2)

### Criterios de aceptación

- 200 con `headline + sentences + highlight_tags`.
- Segunda llamada `cached: true` y respuesta rápida.
- Wallet no encontrada -> 404 claro.
- Wallet con poco histórico -> fallback narrativo robusto.
- Render de card en `smart-money`.
- Soporte `lang=es|en` (default `es`).

### Fuera de alcance de esta iteración

- No recalcular `confidence` (Feature 1).
- No cluster detection completo ni rug radar completo.
- No librería i18n completa (solo plantillas ES/EN).
- Sin migraciones nuevas (si no son necesarias).

### Estimación

- Backend: 3-4h
- Frontend: 2-3h
- Deploy + smoke test: 1h
- **Total: ~1 día**

---

## Anexo — HOME WAR (aportes nuevos no duplicados)

### Visión de producto

**"Sentinel es la terminal de Solana smart money que se siente como pilotar un caza: cruda, bellísima y adictiva."**

Competencia principal por:
- sensación de producto,
- velocidad narrativa,
- calidad estética,
- transparencia radical.

### Constitución UX (reglas no negociables)

1. Todo dato se cuenta como historia.
2. Latencia percibida ultra-baja (skeleton/streaming/optimistic UI).
3. Teclado primero (`Cmd+K` y atajos visibles).
4. Terminal look permanente (dark-first).
5. El home es el producto.
6. Cada insight compartible por defecto.
7. Transparencia radical (incluye fallos y verificación).
8. Tier gratuito útil de verdad.

### Identidad visual propuesta (design system)

- Paleta base: `#0A0B0D`, `#12141A`, `#E6EAF2`, `#8A93A6`, acento `#00F5A0`, riesgo `#FF3D5A`, aviso `#FFB84D`.
- Tipos: `Geist Sans` para UI y `Geist Mono`/`JetBrains Mono` para datos.
- Motion: transiciones 200-350ms con curva suave tipo Linear/Vercel.
- Firma visual: grid sutil + heartbeat line + inputs con cursor tipo terminal.

### Arquitectura del home ("Sentinel Pulse")

Zonas:
0) Heartbeat bar  
1) Hero terminal (Pulse Feed + Live Consensus)  
2) Why Sentinel (demos interactivas)  
3) Proof (track record verificable)  
4) Leaderboard vivo sticky  
5) Social proof  
6) Footer manifesto

### 8 pilares UX/feature del plan maestro

1. Pulse Feed en vivo (eventos narrados).  
2. Command Palette universal `Cmd+K`.  
3. Narrativa "Why this X" (wallet/token/signal).  
4. Share cards generativas (viral loop).  
5. Live Consensus Engine (agregación inteligente).  
6. Guest mode completo 24h sin fricción.  
7. Rug Radar inline en todas las superficies.  
8. Proof-of-Track-Record on-chain.

### Loops de retención y crecimiento

- Adicción al Pulse (sesiones largas).
- Viralidad por share cards.
- Reingreso por alertas de consensus.
- Gamificación de desempeño semanal.
- Publicación semanal de proof verificable.

### Stack y piezas añadidas (todos en enfoque de bajo coste)

- `cmdk`, `react-hotkeys-hook`, `zustand`/`jotai`.
- SSE nativo en Express.
- `@vercel/og`/`satori` para cards.
- `@solana/web3.js` + memo program para proof.

### Roadmap 4 semanas (macro)

- **Semana 1**: cimientos narrativos + cmdk base + design tokens.
- **Semana 2**: Home War completa (Pulse + Consensus + Proof).
- **Semana 3**: share cards + proof on-chain + rug radar inline.
- **Semana 4**: cmdk completo + guest mode + polish + beta pública.

### Criterios de éxito (KPIs)

- Lanzamiento: performance alta, home rápida, proof funcionando.
- Mes 2: DAU y retención D7 sólidos, share cards diarias.
- Mes 3: crecimiento orgánico, posicionamiento SEO y primeras integraciones.
- Mes 6: dataset/proof acumulado como moat defensivo.

### Riesgos operativos y mitigaciones

- Rate limits de proveedores -> cache agresivo + fallback provider.
- Saturación por streaming -> plan de degradación y/o migración de transporte.
- Copia de features -> ventaja en dataset, marca y ritmo de envío.
- Picos virales -> CDN/cache y rutas read-optimized.

### Extras estratégicos añadidos

- Sentinel Report semanal (email/resumen).
- Modo sonido opcional "Bloomberg mode".
- Time Machine (snapshot temporal).
- API pública v0 con rate-limit generoso.
- Modo terminal puro para power users.
- Vista diff entre wallets.

### Próximo paso operativo sugerido

Iniciar por **Feature 2 (Why this wallet)** y ejecutar en branch dedicada (`feat/narrative-engine`) con entregables diarios y smoke test al cierre.

---

## Anexo — Evaluación honesta de probabilidad top 1 mundial

### Respuesta corta

No hay garantía automática de ser top 1 mundial.  
El plan actual está en el top 5% de lo que haría falta a nivel producto, pero requiere capa fuerte de distribución para convertir excelencia técnica en liderazgo real de mercado.

### Distinción crítica

- **Top 1 en producto**: altamente alcanzable si se ejecuta bien (calidad, UX, diferenciación).
- **Top 1 en marketshare/mindshare**: depende también de distribución, timing, capital, red y suerte.

### Lo que ya está bien cubierto

- Calidad de producto y experiencia.
- Diferenciación por narrativa + transparencia + tiempo real.
- Coste operativo bajo en fase inicial.
- Base sólida de retención y compartibilidad.

### Gaps estratégicos identificados

1. **Distribución inicial** (cold start).
2. **Timing de mercado cripto** (ciclos).
3. **Colchón de infra para picos virales**.
4. **Sostenibilidad de equipo/operación**.
5. **Riesgo legal/regulatorio al escalar**.
6. **Factor suerte** (no controlable, solo optimizable).

### Evaluación probabilística orientativa

- Producto excelente reconocido por power users: **70-80%**.
- Tracción orgánica relevante (nicho): **25-35%**.
- Top 5 de referencia en el espacio: **10-18%**.
- Top 1 mundial indiscutible: **2-5%**.

### Palanca para aumentar probabilidad

Agregar un **plan de distribución paralelo** (go-to-market) puede subir la probabilidad materialmente:

- Construcción de audiencia en X desde antes del lanzamiento.
- Estrategia KOL (micro-influencers de alta conversión).
- Lanzamientos semanales en público (building in public).
- Programa de founding members y comunidad.
- Distribución vía integraciones/API pública.

### Próximos caminos operativos

- **A**: ejecutar plan de producto tal cual.
- **B**: diseñar primero plan de distribución paralelo.
- **C**: rediseñar plan integrado producto + distribución semana a semana.

