import { useMemo, useRef } from 'react'
import { useMarketStore } from '@/lib/store/marketStore'

const STRATEGY_HIGH = { conservative: 90, balanced: 85, aggressive: 80 }
const WAR_MIN       = 35
const WAR_TOP       = 6

function applyProfileFilter(result, profile, _isWarMode) {
  if (profile === 'sniper') {
    return result.filter((t) =>
      t._currentScore >= 70 || t.smartMoneyCount > 0
    )
  }
  if (profile === 'liquidity') {
    return result
      .filter((t) => (t.liquidityUsd ?? 0) > 50_000)
      .sort((a, b) => (b.liquidityUsd ?? 0) - (a.liquidityUsd ?? 0))
  }
  if (profile === 'momentum') {
    return [...result].sort((a, b) =>
      (b.priceChange24h ?? 0) - (a.priceChange24h ?? 0)
    )
  }
  return result
}

export function useSortedTokens(tokens = []) {
  const isWarMode = useMarketStore((s) => s.isWarMode)
  const strategy  = useMarketStore((s) => s.strategy)
  const profile   = useMarketStore((s) => s.profile)

  const prevOrderRef = useRef([])

  return useMemo(() => {
    if (!tokens.length) return []

    const enriched = tokens.map((t) => ({
      ...t,
      _mint: t.mint ?? t.address,
      _currentScore: t._currentScore ?? t.sentinelScore ?? 0,
      _isLive: false,
    }))

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

    result = applyProfileFilter(result, profile, isWarMode)
    prevOrderRef.current = result.map((t) => t._mint)
    return result

  }, [tokens, isWarMode, strategy, profile])
}
