import { useMemo, useRef } from 'react'
import { useMarketStore, isScoreFresh } from '@/lib/store/marketStore'

const STRATEGY_HIGH = { conservative: 90, balanced: 85, aggressive: 80 }
const WAR_MIN       = 35
const WAR_TOP       = 8

export function useSortedTokens(tokens = []) {
  const scores    = useMarketStore((s) => s.scores)
  const isWarMode = useMarketStore((s) => s.isWarMode)
  const strategy  = useMarketStore((s) => s.strategy)
  const profile   = useMarketStore((s) => s.profile)

  // Cache del orden anterior para evitar reordenamientos innecesarios
  const prevOrderRef = useRef([])

  return useMemo(() => {
    if (!tokens.length) return []

    // Calcular now UNA sola vez fuera de cualquier loop reactivo
    const now = Date.now()

    // 1. Enriquecer con score efectivo
    const enriched = tokens.map((t) => {
      const mint  = t.mint ?? t.address
      const entry = scores.get(mint)
      const live  = isScoreFresh(entry, now) ? entry.score : null
      return {
        ...t,
        _mint:         mint,
        _currentScore: live ?? t.sentinelScore ?? 0,
        _isLive:       live !== null,
      }
    })

    // 2. Filtrar y ordenar
    let result
    if (isWarMode) {
      result = enriched
        .filter((t) => t._currentScore >= WAR_MIN)
        .sort((a, b) => b._currentScore - a._currentScore)
        .slice(0, WAR_TOP)
    } else {
      const high = STRATEGY_HIGH[strategy] ?? 85
      const top  = enriched.filter((t) => t._currentScore >= high)
        .sort((a, b) => b._currentScore - a._currentScore)
      const rest = enriched.filter((t) => t._currentScore < high)
        .sort((a, b) => b._currentScore - a._currentScore)
      result = [...top, ...rest]
    }

    // 3. Filtro por perfil cognitivo
    if (profile === 'sniper') {
      result = result.filter((t) =>
        t._currentScore >= 70 || t.smartMoneyCount > 0
      )
    } else if (profile === 'liquidity') {
      result = result
        .filter((t) => (t.liquidityUsd ?? 0) > 50_000)
        .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
    } else if (profile === 'momentum') {
      result = result.sort((a, b) =>
        (b.priceChange24h ?? 0) - (a.priceChange24h ?? 0)
      )
    }

    prevOrderRef.current = result.map((t) => t._mint)
    return result

  }, [tokens, scores, isWarMode, strategy, profile])
}
