# Sentinel Engine — Operator Reference

Single source of truth for what the engine is, where each piece runs, and how
to turn anything off without touching code.

> Cost target: **0 €**. No LLMs, no new APIs, no new infra. Everything below
> uses the Supabase / Redis / Helius webhooks / RPC stack that is already in
> production.

---

## 1. The seven-layer engine

```
1. Signal Engine          backend/src/scoring/engine.js
2. Decision Engine        backend/src/orchestrator/sentinelOrchestrator.js (templates + classify)
3. Orchestrator roles     same file: Observer (socket), Judge (classify),
                          Narrator (templates), Planner (planCta), Guard (deduped, rateLimited)
4. Evidence Layer         backend/src/services/signalPerformance.js + table signal_performance
5. Validation Oracle      backend/src/workers/validationOracle.js (5m / 15m / 60m)
6. State Machine          backend/src/services/tokenStateMachine.js (in-memory, TTL)
7. Auto-Discovery         backend/src/workers/autoDiscovery.js (smart_wallets WHERE source='auto_discovery')
```

Supporting layers built around them:

| Concern | Service | Cron |
|---|---|---|
| Adaptive gate (learns thresholds) | `services/signalGateTuner.js` | `jobs/signalGateTunerCron.js` |
| Per-rule weight learning | `services/signalCalibrator.js` | `jobs/signalCalibratorCron.js` |
| Outcome resolver (T+N pricing) | `services/signalPerformance.js` | `jobs/signalOutcomeCron.js` |
| Wallet behavior memory | `services/walletBehaviorMemory.js` | `jobs/walletBehaviorCron.js` |
| Convergence / coordination | `services/walletCoordinationService.js` | `jobs/walletCoordinationCron.js` |
| Triple-risk regime (server mirror) | `lib/tripleRiskRegime.cjs` | n/a (called inline) |
| Alpha layer (EV / slippage / meta-label) | `services/signalAlphaLayer.js` | n/a (per-score) |
| Narrative for the feed | `orchestrator/sentinelOrchestrator.js` (templates) + `services/walletNarrative.js` | n/a |

---

## 2. The kill switches you actually care about

Every layer can be disabled with a single env var. None require a redeploy of
schema or infra; flip the value, restart the service, and the layer goes
silent. All defaults below are **safe** (either `true` for things proven to
work, or `false` for things that need data first).

| Env var | Default | What turning it off does |
|---|---|---|
| `VALIDATION_ORACLE_ENABLED` | `true` | Stops resolving 5m/15m/60m outcomes. Track Record stops accruing. |
| `SIGNAL_PERF_CRON_ENABLED` | `true` | Stops resolving outcomes; Oracle has nothing to read. |
| `SIGNAL_CALIBRATOR_ENABLED` | `true` | Per-rule weights freeze at last value. |
| `SIGNAL_GATE_ENABLED` | `true` | Removes pre-emit checks; raw scores flow through. |
| `SIGNAL_GATE_ADAPTIVE_ENABLED` | `false` | When `true`, tuner can apply bounded threshold updates. Set to `true` once you have ≥80 resolved outcomes in the lookback window. |
| `SIGNAL_GATE_ADAPTIVE_REGIME_AWARE` | `false` | Per-regime tuning. Enable only with ≥20 outcomes per regime. |
| `SIGNAL_ALPHA_LAYER_ENABLED` | `true` | Removes EV proxy / slippage risk / meta-label from `score.meta`. |
| `AUTO_DISCOVERY_ENABLED` | `true` | Stops harvesting candidates from validated signals. |
| `AUTO_DISCOVERY_PROMOTION_ENABLED` | `true` | Candidates stay in `candidate` status, never promoted. |
| `WALLET_BEHAVIOR_CRON_ENABLED` | `true` | Wallet style + win-rate stats freeze. |
| `WALLET_COORD_CRON_ENABLED` | `true` | Convergence / red-alert detection paused. |
| `SENTINEL_STATE_TTL_MS` | `21600000` (6 h) | TTL for the per-token state machine; lower means faster forgetting. |

---

## 3. Where data flows

```
Helius webhook ──▶ ingestion ──▶ scoring/engine ──▶ socket "sentinel:score"
                                         │
                                         ▼
                              orchestrator (Observer)
                                         │
                                ┌────────┴────────┐
                                ▼                 ▼
                     state machine        evidence layer
                     (in-memory map)      (signal_performance)
                                                  │
                                                  ▼
                                        Validation Oracle
                                          (5m / 15m / 60m)
                                                  │
                                ┌─────────────────┼─────────────────┐
                                ▼                 ▼                 ▼
                            Calibrator       Auto-Discovery     Track Record
                            (rule weights)   (smart_wallets)    (graveyard.js)
```

Frontend hooks:

- `hooks/useScoreSocket.js` — listens to `sentinel:score`.
- `src/features/war-home/tabs/LiveTab.jsx` — listens to `sentinel:narrative` and renders `SentinelNarrativeBanner` (now also receives `state`).

---

## 4. State machine states

| State | When it fires | Visible meaning |
|---|---|---|
| `IDLE` | confidence < 0.25 | Nothing actionable. |
| `WATCH` | score 40–65, confidence ≥ 0.3 | Setup forming. |
| `ACCUMULATE` | score ≥ 65, confidence ≥ 0.5, severity URGENT/TACTICAL | Engine sees coordinated entry. |
| `OVERHEAT` | priceChange24h ≥ 35 with negative scoreDelta, or ≥ 60 absolute | Momentum exhaustion. |
| `EXIT` | action TOO LATE / STAY OUT | Door closed. |
| `LEDGER` | outcome resolved | Historical only — feeds Track Record. |

Transitions are deterministic — same input produces same next state — and
`EXIT` / `LEDGER` are terminal until the TTL expires (6 h by default).

---

## 5. Track Record (Verified Trust Ledger)

`/graveyard` (rendered as **Verified Track Record**) reads
`GET /api/v1/signals/track-record` and shows:

- Total signals, resolved signals, win rate 60m, average return, max drawdown
- Best call / worst call (real outcomes, no curation)
- Per-rule performance ranked by `confidence_score`
- Recent signal history (paginated)
- Top wins / worst losses
- **Auto-discovered wallets** (since Phase 5) — wallets the engine found by
  itself from validated signals, with their real win rate

If `signal_outcomes` is empty, the page does not invent metrics — every
section that lacks data degrades to "Accumulating".

---

## 6. Operating playbook

### Safe rollout sequence

1. Deploy code (current state — all flags safe).
2. Wait 24–48 h with `SIGNAL_PERF_CRON_ENABLED=true` and
   `VALIDATION_ORACLE_ENABLED=true`. Confirm `signal_performance` is filling
   `result_5m_pct`, `result_15m_pct`, `result_60m_pct`.
3. Confirm `rule_performance` rows appear (Calibrator output).
4. Once `resolved_signals ≥ 80`, flip `SIGNAL_GATE_ADAPTIVE_ENABLED=true` to
   let the tuner apply bounded updates.
5. Once `regimes[]` has ≥ 20 resolved per regime, flip
   `SIGNAL_GATE_ADAPTIVE_REGIME_AWARE=true`.

### Rollback

Any single flag flip rolls a layer back to silent. No DB migrations need to
be reversed. `git tag sentinel-engine-v0-baseline` marks the pre-rollout
commit if you ever need to redeploy a clean baseline.

---

## 7. Costs

- **Compute**: same Railway service.
- **Storage**: same Supabase tables (`signal_performance`, `rule_performance`,
  `signal_outcomes`, `smart_wallets`). No new tables.
- **Cache**: in-memory `Map` for the state machine; existing Upstash Redis
  for everything else.
- **External calls**: Helius / Birdeye / DexScreener at the same rate as
  before. No new providers.

Total marginal cost of running the seven-layer engine: **0 €**.
