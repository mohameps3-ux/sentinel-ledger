import { useEffect } from 'react'
import { useMarketStore } from '@/lib/store/marketStore'
import { getPublicWsUrl } from '@/lib/publicRuntime'

export function ScoreSocketProvider({ children }) {
  // Selectores finos: solo suscribe a las funciones, nunca al store completo.
  // Esto evita que el provider se re-renderice cuando cambian scores o narratives.
  const updateLiveScore = useMarketStore((s) => s.updateLiveScore)
  const updateNarrative = useMarketStore((s) => s.updateNarrative)

  useEffect(() => {
    const url = getPublicWsUrl()
    if (!url) return

    let socket = null

    import('socket.io-client').then(({ io }) => {
      socket = io(url, {
        transports: ['websocket'],
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
      })

      socket.on('sentinel:score', (data) => {
        if (data?.mint && data?.score !== undefined) {
          updateLiveScore(data.mint, data.score)
        }
      })

      socket.on('sentinel:narrative', (data) => {
        if (data?.mint && data?.message) {
          updateNarrative(data.mint, data.message, data.severity)
        }
      })
    })

    return () => {
      if (socket) {
        socket.off('sentinel:score')
        socket.off('sentinel:narrative')
        socket.disconnect()
      }
    }
  }, [updateLiveScore, updateNarrative])

  return children
}
