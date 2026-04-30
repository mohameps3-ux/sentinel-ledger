import { create } from 'zustand'

const SCORE_TTL_MS = 120_000 // 2 minutos

export const useMarketStore = create((set, get) => ({

  scores:     new Map(), // Map<mint, { ...socketPayload, _ts }>
  narratives: new Map(), // Map<mint, { message, severity }>
  strategy:   'balanced',
  profile:    'balanced',
  isWarMode:  false,
  /** Mirrors shared score socket connect/disconnect (ScoreSocketProvider). */
  scoreSocketConnected: false,

  setStrategy: (strategy) => set({ strategy }),
  setProfile:  (profile)  => set({ profile }),
  setWarMode:  (v)        => set({ isWarMode: v }),
  setScoreSocketConnected: (v) => set({ scoreSocketConnected: Boolean(v) }),

  updateLiveScore: (mint, payload) =>
    set((state) => {
      const id = String(mint || '').trim()
      if (!id || !payload || typeof payload !== 'object') return state
      const next = new Map(state.scores)
      next.set(id, { ...payload, _ts: Date.now() })
      return { scores: next }
    }),

  updateNarrative: (mint, message, severity = 'info') =>
    set((state) => {
      const next = new Map(state.narratives)
      next.set(mint, { message, severity })
      return { narratives: next }
    }),

  // Llama desde fuera del store pasando Date.now() explícito.
  // Nunca llames Date.now() dentro de un selector reactivo.
  getDisplayScore: (mint, now) => {
    const live = get().scores.get(mint)
    if (!live || (now - live._ts) >= SCORE_TTL_MS) return null
    const c = live.confidence
    if (Number.isFinite(Number(c))) return Number(c)
    const legacy = live.score
    if (Number.isFinite(Number(legacy))) return Number(legacy)
    return null
  },
}))

// Helper puro (no reactivo) — úsalo en hooks y componentes
export function isScoreFresh(entry, now = Date.now()) {
  return entry && (now - entry._ts) < SCORE_TTL_MS
}

/** Strip client-only `_ts` before passing snapshots to helpers expecting API-shaped scores. */
export function scoreSnapshot(entry) {
  if (!entry || typeof entry !== 'object') return null
  const { _ts, ...rest } = entry
  return rest
}
