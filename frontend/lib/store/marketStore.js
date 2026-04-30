import { create } from 'zustand'

const SCORE_TTL_MS = 120_000 // 2 minutos

export const useMarketStore = create((set, get) => ({

  scores:     new Map(), // Map<mint, { score, _ts }>
  narratives: new Map(), // Map<mint, { message, severity }>
  strategy:   'balanced',
  profile:    'balanced',
  isWarMode:  false,

  setStrategy: (strategy) => set({ strategy }),
  setProfile:  (profile)  => set({ profile }),
  setWarMode:  (v)        => set({ isWarMode: v }),

  updateLiveScore: (mint, score) =>
    set((state) => {
      const next = new Map(state.scores)
      next.set(mint, { score, _ts: Date.now() })
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
    if (live && (now - live._ts) < SCORE_TTL_MS) return live.score
    return null
  },
}))

// Helper puro (no reactivo) — úsalo en hooks y componentes
export function isScoreFresh(entry, now = Date.now()) {
  return entry && (now - entry._ts) < SCORE_TTL_MS
}
