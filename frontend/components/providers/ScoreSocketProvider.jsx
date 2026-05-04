import { useEffect } from 'react'
import { useMarketStore } from '@/lib/store/marketStore'
import { getPublicWsUrl } from '@/lib/publicRuntime'
import { bindScoreRoomSocket, replayScoreRoomJoins } from '@/lib/scoreRoomClient'

export function ScoreSocketProvider({ children }) {
  // Selectores finos: solo suscribe a las funciones, nunca al store completo.
  // Esto evita que el provider se re-renderice cuando cambian scores o narratives.
  const updateLiveScore = useMarketStore((s) => s.updateLiveScore)
  const updateNarrative = useMarketStore((s) => s.updateNarrative)
  const setScoreSocketConnected = useMarketStore((s) => s.setScoreSocketConnected)

  useEffect(() => {
    const url = getPublicWsUrl()
    if (!url) return undefined

    let cancelled = false
    let active = null

    import('socket.io-client').then(({ io }) => {
      if (cancelled) return
      const socket = io(url, {
        transports: ['websocket', 'polling'],
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
      })
      active = socket

      bindScoreRoomSocket(socket)

      const onConnect = () => {
        setScoreSocketConnected(true)
        replayScoreRoomJoins()
      }
      const onDisconnect = () => setScoreSocketConnected(false)

      socket.on('connect', onConnect)
      socket.on('disconnect', onDisconnect)

      socket.on('sentinel:score', (data) => {
        if (!data || typeof data !== 'object') return
        const mint = data.asset || data.mint || data.tokenAddress
        if (!mint) return
        updateLiveScore(String(mint).trim(), data)
      })

      socket.on('sentinel:narrative', (data) => {
        if (data?.mint && data?.message) {
          updateNarrative(data.mint, data.message, data.severity)
        }
      })

      if (socket.connected) {
        setScoreSocketConnected(true)
        replayScoreRoomJoins()
      }
    })

    return () => {
      cancelled = true
      bindScoreRoomSocket(null)
      setScoreSocketConnected(false)
      if (active) {
        active.off('connect')
        active.off('disconnect')
        active.off('sentinel:score')
        active.off('sentinel:narrative')
        active.disconnect()
        active = null
      }
    }
  }, [updateLiveScore, updateNarrative, setScoreSocketConnected])

  return children
}
