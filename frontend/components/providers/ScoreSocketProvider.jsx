import { useEffect, useRef } from 'react'
import { useWallet } from '@solana/wallet-adapter-react'
import { useMarketStore } from '@/lib/store/marketStore'
import { getPublicWsUrl } from '@/lib/publicRuntime'
import { bindScoreRoomSocket, replayScoreRoomJoins } from '@/lib/scoreRoomClient'

function emitProRoomMembership(socket, walletAddress) {
  if (!socket) return
  try {
    if (walletAddress) {
      socket.emit('join-pro', walletAddress)
    } else {
      socket.emit('leave-pro')
    }
  } catch (_) {
    /* ignore */
  }
}

export function ScoreSocketProvider({ children }) {
  const { publicKey, connected } = useWallet()
  const walletAddress = connected && publicKey ? publicKey.toBase58() : null
  const walletRef = useRef(walletAddress)
  walletRef.current = walletAddress

  const socketRef = useRef(null)

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
      socketRef.current = socket

      bindScoreRoomSocket(socket)

      const onConnect = () => {
        setScoreSocketConnected(true)
        replayScoreRoomJoins()
        emitProRoomMembership(socket, walletRef.current)
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
        emitProRoomMembership(socket, walletRef.current)
      }
    })

    return () => {
      cancelled = true
      bindScoreRoomSocket(null)
      setScoreSocketConnected(false)
      socketRef.current = null
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

  useEffect(() => {
    const socket = socketRef.current
    if (!socket?.connected) return
    emitProRoomMembership(socket, walletAddress)
  }, [walletAddress])

  return children
}
