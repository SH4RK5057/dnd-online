import { useCallback, useEffect, useRef, useState } from 'react'
import { CONNECT_TIMEOUT_MS, RECONNECT_GRACE_MS } from './constants'
import type { SessionState } from './context'
import type { ConnectionFailureInfo, ConnectionStatus, PeerInfo } from './types'

interface UseConnectionStatusResult {
  status: ConnectionStatus
  peers: PeerInfo[]
  failure: ConnectionFailureInfo | null
  retry: () => void
}

const SIGNALING_UNREACHABLE_MESSAGE =
  "Can't reach the signaling server. Check that it's running (or deployed) and that VITE_SIGNALING_URLS points at it."
const NO_PEERS_MESSAGE =
  "Signaling server reached, but a direct connection couldn't be established. This usually means a restrictive network (school/office WiFi, some mobile carriers) is blocking it, or the session isn't online. This app only uses free STUN, no TURN relay, so some strict networks genuinely can't connect — try a different network if this persists."

export function useConnectionStatus(session: SessionState | null): UseConnectionStatusResult {
  const [status, setStatus] = useState<ConnectionStatus>('idle')
  const [peers, setPeers] = useState<PeerInfo[]>([])
  const [failure, setFailure] = useState<ConnectionFailureInfo | null>(null)

  const knownPeersRef = useRef<Map<string, PeerInfo>>(new Map())
  const pendingRemovalRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  useEffect(() => {
    knownPeersRef.current = new Map()
    pendingRemovalRef.current.forEach((t) => clearTimeout(t))
    pendingRemovalRef.current = new Map()

    if (!session) {
      setStatus('idle')
      setPeers([])
      setFailure(null)
      return
    }

    const { provider, role } = session
    const isDm = role === 'dm'

    setStatus('connecting')
    setFailure(null)
    setPeers([])

    let settled = false
    const signalingConnectedRef = { current: false }

    const markConnected = () => {
      settled = true
      setStatus('connected')
      setFailure(null)
    }

    const fail = (info: ConnectionFailureInfo) => {
      setStatus('failed')
      setFailure(info)
    }

    // Awareness messages travel over the same WebRTC data channel as Yjs doc updates, so a
    // remote peer showing up here is itself proof the channel is live — a more robust signal
    // than the library's internal 'synced' event, which only fires on a state *transition* and
    // can be emitted (and missed) before this effect's listeners even attach.
    const evaluatePlayerStatus = (currentPeers: PeerInfo[]) => {
      if (isDm) return
      const hasConnectedPeer = currentPeers.some((peer) => peer.connectionState === 'connected')
      if (hasConnectedPeer) {
        markConnected()
      } else if (settled) {
        setStatus('reconnecting')
      }
    }

    const computePeers = () => {
      const states = provider.awareness.getStates()
      const current = new Map<string, PeerInfo>()
      states.forEach((state, clientId) => {
        if (clientId === provider.doc.clientID) return
        if (!state?.playerId) return
        current.set(state.playerId, {
          clientId,
          isLocal: false,
          playerId: state.playerId,
          role: state.role,
          name: state.name,
          joinedAt: state.joinedAt,
          connectionState: 'connected',
        })
      })

      // Anyone back: cancel their pending removal.
      current.forEach((_peer, playerId) => {
        const timer = pendingRemovalRef.current.get(playerId)
        if (timer) {
          clearTimeout(timer)
          pendingRemovalRef.current.delete(playerId)
        }
      })

      // Anyone previously known but now missing: hold as "reconnecting" for a grace period.
      knownPeersRef.current.forEach((prevPeer, playerId) => {
        if (current.has(playerId) || pendingRemovalRef.current.has(playerId)) return
        current.set(playerId, { ...prevPeer, connectionState: 'reconnecting' })
        const timer = setTimeout(() => {
          pendingRemovalRef.current.delete(playerId)
          knownPeersRef.current.delete(playerId)
          const next = Array.from(knownPeersRef.current.values())
          setPeers(next)
          evaluatePlayerStatus(next)
        }, RECONNECT_GRACE_MS)
        pendingRemovalRef.current.set(playerId, timer)
      })

      knownPeersRef.current = current
      const next = Array.from(current.values())
      setPeers(next)
      evaluatePlayerStatus(next)
    }

    const onStatus = ({ connected }: { connected: boolean }) => {
      signalingConnectedRef.current = connected
      // The DM doesn't need a peer to be "connected" — waiting for players is normal.
      if (isDm && connected) markConnected()
    }

    const onPeers = () => computePeers()
    const onAwarenessChange = () => computePeers()

    provider.on('status', onStatus)
    provider.on('peers', onPeers)
    provider.awareness.on('change', onAwarenessChange)

    const timeoutId = setTimeout(() => {
      if (settled) return
      fail(
        signalingConnectedRef.current
          ? { reason: 'no-peers', message: NO_PEERS_MESSAGE }
          : { reason: 'signaling-unreachable', message: SIGNALING_UNREACHABLE_MESSAGE },
      )
    }, CONNECT_TIMEOUT_MS)

    computePeers()

    return () => {
      clearTimeout(timeoutId)
      pendingRemovalRef.current.forEach((t) => clearTimeout(t))
      provider.off('status', onStatus)
      provider.off('peers', onPeers)
      provider.awareness.off('change', onAwarenessChange)
    }
  }, [session])

  const retry = useCallback(() => {
    if (!session) return
    setStatus('connecting')
    setFailure(null)
    session.provider.disconnect()
    session.provider.connect()
  }, [session])

  return { status, peers, failure, retry }
}
