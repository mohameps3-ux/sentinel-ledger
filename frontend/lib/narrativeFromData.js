// frontend/lib/narrativeFromData.js
// Generates intent-based narrative from token data when
// no live sentinel:narrative is available from the socket.

export function narrativeFromData(token) {
  const score    = token._currentScore ?? token.sentinelScore ?? 0
  const wallets  = token.smartMoneyCount ?? token.smartWallets ?? 0
  const change   = token.priceChange24h ?? token.change24h ?? 0
  const liq      = token.liquidityUsd ?? token.liquidity ?? 0
  const age      = token.poolAgeMinutes ?? null
  const source   = token._liveSource ?? token._source ?? ''
  const action   = token.decision ?? token.action ?? 'WATCH'

  // Smart money signals (highest priority)
  if (wallets >= 5) return `${wallets} smart wallets acumulando activamente`
  if (wallets >= 3) return `${wallets} wallets top entrando en silencio`
  if (wallets >= 1 && score >= 80) return `Smart money + score alto — convergencia`

  // Early entry window
  if (age !== null && age < 10 && score >= 70)
    return `Pool nuevo (${Math.round(age)}m) — ventana de entrada temprana`
  if (age !== null && age < 30 && score >= 80)
    return `Entrada temprana detectada — ${Math.round(age)}m de vida`

  // Strong momentum
  if (change >= 50 && liq > 100_000) return `Pump +${Math.round(change)}% con liquidez sólida`
  if (change >= 30 && score >= 75)   return `Momentum fuerte — +${Math.round(change)}% en 24h`
  if (change >= 20 && wallets >= 1)  return `Movimiento + smart money confirmado`

  // Score-based signals
  if (score >= 90) return `Señal máxima — todos los factores alineados`
  if (score >= 80) return `Alta convicción — score ${score} con baja exposición`
  if (score >= 70) return `Señal sólida — monitoreo activo recomendado`

  // Heat fill tokens
  if (source === 'hot_fill' && change >= 15) return `Calor de mercado — actividad inusual`
  if (source === 'hot_fill') return `Token en tendencia — volumen elevado`

  // Action-based fallbacks
  if (action === 'BUY' || action === 'ENTER NOW')  return `Condiciones de entrada confirmadas`
  if (action === 'SCALP')  return `Oportunidad de scalp — entrada rápida`
  if (action === 'WATCH')  return `En vigilancia — esperando confirmación`

  return `Señal activa — score ${score}`
}
