import Peer, { MediaConnection, DataConnection } from 'peerjs'

// ═══════════════════════════════════════════════════════════════════════════════
// UNIFIED PEER CONNECTION - Works on ANY Network, ANY Device
// Optimized for Latin America / Colombia - handles restrictive carriers,
// slow connections, mobile data, and challenging network conditions
// ═══════════════════════════════════════════════════════════════════════════════

// PeerJS Server Configuration - Multiple servers for redundancy
// Priority: Custom server > PeerJS Cloud > Fallback servers
interface PeerServerConfig {
  host: string
  port: number
  path: string
  secure: boolean
  key?: string
}

const PEER_SERVERS: PeerServerConfig[] = [
  // Primary: PeerJS Cloud (free tier)
  { host: '0.peerjs.com', port: 443, path: '/', secure: true },
  // Fallback 1: Alternative PeerJS cloud
  { host: 'peerjs-server.herokuapp.com', port: 443, path: '/', secure: true },
  // Fallback 2: Scaledrone PeerJS (free tier available)
  { host: 'peer.scaledrone.com', port: 443, path: '/', secure: true },
]

// Get custom PeerJS server from environment (if configured)
function getCustomPeerServer(): PeerServerConfig | null {
  if (typeof window !== 'undefined') {
    // Check for custom server URL in window config
    const customUrl = (window as any).__VOXLINK_PEER_SERVER__
    if (customUrl) {
      try {
        const url = new URL(customUrl)
        return {
          host: url.hostname,
          port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname || '/',
          secure: url.protocol === 'https:',
          key: url.searchParams.get('key') || undefined
        }
      } catch { /* invalid URL, ignore */ }
    }
  }
  return null
}

// Get ordered list of servers to try
function getPeerServers(): PeerServerConfig[] {
  const custom = getCustomPeerServer()
  if (custom) {
    return [custom, ...PEER_SERVERS]
  }
  return PEER_SERVERS
}

export type ConnectionMode = 'video' | 'talk'
export type ConnectionStatus = 'initializing' | 'waiting' | 'connecting' | 'connected' | 'reconnecting' | 'failed'

export interface PeerCallbacks {
  onStatusChange?: (status: ConnectionStatus, message?: string) => void
  onRemoteStream?: (stream: MediaStream) => void
  onDataMessage?: (data: any) => void
  onPartnerJoined?: (name: string) => void
  onPartnerLeft?: () => void
  onError?: (error: string) => void
}

// COMPREHENSIVE ICE SERVERS - Works globally, optimized for Latin America
// Includes multiple STUN + TURN servers with TCP fallback for restrictive networks
const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN - highly reliable globally
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },

  // Twilio STUN - excellent global coverage
  { urls: 'stun:global.stun.twilio.com:3478' },

  // Additional public STUN servers for redundancy
  { urls: 'stun:stun.stunprotocol.org:3478' },
  { urls: 'stun:stun.voip.eutelia.it:3478' },

  // OpenRelay TURN - Free, works globally
  // UDP (fastest)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  // TLS over 443 (bypasses most firewalls)
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  // TCP fallback (works on restrictive mobile networks)
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },

  // Additional free TURN servers for redundancy
  {
    urls: 'turn:relay.metered.ca:80',
    username: 'e8dd65b92c62d5e91f3ce421',
    credential: 'uWdWNmkhvyqTmFGp'
  },
  {
    urls: 'turn:relay.metered.ca:443',
    username: 'e8dd65b92c62d5e91f3ce421',
    credential: 'uWdWNmkhvyqTmFGp'
  },
  {
    urls: 'turn:relay.metered.ca:443?transport=tcp',
    username: 'e8dd65b92c62d5e91f3ce421',
    credential: 'uWdWNmkhvyqTmFGp'
  }
]

// Aggressive ICE configuration for challenging networks
const PEER_CONFIG = {
  iceServers: ICE_SERVERS,
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all' as RTCIceTransportPolicy, // Try all transports
  bundlePolicy: 'max-bundle' as RTCBundlePolicy,
  rtcpMuxPolicy: 'require' as RTCRtcpMuxPolicy
}

export class PeerConnection {
  private peer: Peer | null = null
  private dataConnection: DataConnection | null = null
  private localStream: MediaStream | null = null

  // Track media connection - only ONE active connection
  private mediaConnection: MediaConnection | null = null
  private activeRemoteStream: MediaStream | null = null
  private remoteStreamId: string | null = null
  private streamLocked: boolean = false

  private mode: ConnectionMode = 'video'
  private roomId: string = ''
  private isHost: boolean = false
  private userName: string = ''
  private partnerName: string = ''
  private partnerPeerId: string = ''

  private _status: ConnectionStatus = 'initializing'
  private callbacks: PeerCallbacks = {}
  private isDestroyed: boolean = false

  private reconnectAttempts = 0
  private maxReconnects = 5 // Reduced - don't spam reconnections
  private reconnectTimer: NodeJS.Timeout | null = null
  private pingInterval: NodeJS.Timeout | null = null
  private connectionCheckInterval: NodeJS.Timeout | null = null
  private iceRestartTimer: NodeJS.Timeout | null = null

  // Track which server we're using
  private currentServerIndex = 0
  private serverRetryCount = 0

  // Stability tracking - prevent reconnection loops
  private lastStableConnection: number = 0
  private reconnectCooldown: boolean = false
  private connectionStable: boolean = false

  constructor(callbacks: PeerCallbacks) {
    this.callbacks = callbacks
  }

  get status() { return this._status }
  get isConnected() { return this._status === 'connected' }

  // ═══════════════════════════════════════════════════════════════════════════
  // INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════

  async connect(
    roomId: string,
    isHost: boolean,
    userName: string,
    mode: ConnectionMode,
    localStream?: MediaStream
  ): Promise<boolean> {
    this.roomId = roomId
    this.isHost = isHost
    this.userName = userName
    this.mode = mode
    this.localStream = localStream || null
    this.isDestroyed = false

    const peerId = isHost
      ? `vox-${mode}-${roomId}-host`
      : `vox-${mode}-${roomId}-${Date.now()}`

    const hostPeerId = `vox-${mode}-${roomId}-host`

    this.setStatus('initializing', 'Conectando...')

    try {
      // Try connecting to PeerJS servers with fallback
      const servers = getPeerServers()
      let connected = false
      let lastError: Error | null = null

      for (let i = 0; i < servers.length && !connected && !this.isDestroyed; i++) {
        const server = servers[i]
        this.currentServerIndex = i

        console.log(`🔌 Trying PeerJS server ${i + 1}/${servers.length}: ${server.host}`)

        try {
          this.peer = new Peer(peerId, {
            host: server.host,
            port: server.port,
            path: server.path,
            secure: server.secure,
            key: server.key || 'peerjs',
            config: PEER_CONFIG,
            debug: 0
          })

          // Wait for connection with timeout
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              this.peer?.destroy()
              reject(new Error(`Server ${server.host} timeout`))
            }, 10000) // 10s per server

            this.peer!.on('open', (id) => {
              clearTimeout(timeout)
              console.log(`✅ Connected to ${server.host}, peer ID:`, id)
              connected = true
              resolve()
            })

            this.peer!.on('error', (err: any) => {
              if (err.type === 'unavailable-id') {
                console.log('ID taken, retrying with new ID...')
                this.peer?.destroy()
                const newPeerId = `${peerId}-${Math.random().toString(36).slice(2, 6)}`
                this.peer = new Peer(newPeerId, {
                  host: server.host,
                  port: server.port,
                  path: server.path,
                  secure: server.secure,
                  key: server.key || 'peerjs',
                  config: PEER_CONFIG,
                  debug: 0
                })
                this.peer!.on('open', () => {
                  clearTimeout(timeout)
                  connected = true
                  resolve()
                })
                this.peer!.on('error', (e) => {
                  clearTimeout(timeout)
                  reject(e)
                })
              } else {
                clearTimeout(timeout)
                reject(err)
              }
            })
          })

          if (connected) break
        } catch (err: any) {
          console.warn(`❌ Server ${server.host} failed:`, err.message)
          lastError = err
          this.peer?.destroy()
          this.peer = null
          // Continue to next server
        }
      }

      if (!connected) {
        throw lastError || new Error('All PeerJS servers unavailable')
      }

      this.setupListeners(hostPeerId)

      if (isHost) {
        this.setStatus('waiting', 'Esperando compañero...')
      } else {
        this.setStatus('connecting', 'Conectando...')
        this.connectToPeer(hostPeerId)
      }

      this.startConnectionCheck()

      return true
    } catch (err: any) {
      if (!this.isDestroyed) {
        console.error('Connection failed:', err)
        this.setStatus('failed', err.message || 'Connection failed')
        this.callbacks.onError?.(err.message)
      }
      return false
    }
  }

  private setupListeners(hostPeerId: string): void {
    if (!this.peer) return

    // Handle incoming calls - only accept ONE
    this.peer.on('call', (call) => {
      if (this.isDestroyed) return

      // Reject if we already have an active stream
      if (this.streamLocked || this.mediaConnection) {
        console.log('📞 Rejecting duplicate call - already connected')
        return
      }

      console.log('📞 Incoming call from:', call.peer)
      this.partnerPeerId = call.peer

      // Set up the media connection
      this.setupMediaConnection(call)

      // Answer with our stream
      if (this.localStream) {
        console.log('📞 Answering with stream')
        call.answer(this.localStream)
      } else {
        call.answer()
      }
    })

    // Handle incoming data connections
    this.peer.on('connection', (conn) => {
      if (this.isDestroyed) return
      console.log('📡 Incoming data connection from:', conn.peer)
      this.partnerPeerId = conn.peer
      this.setupDataConnection(conn)

      // Host calls guest after data connection is established
      // Only host initiates the call to prevent race conditions
      if (this.isHost && this.localStream && this.mode === 'video') {
        setTimeout(() => {
          if (!this.isDestroyed && this.peer && !this.streamLocked) {
            console.log('📞 Host initiating call to guest:', conn.peer)
            this.callPeer(conn.peer)
          }
        }, 800)
      }
    })

    this.peer.on('disconnected', () => {
      if (this.isDestroyed) return
      console.log('⚠️ Disconnected from signaling server')
      if (this._status === 'connected' && this.peer) {
        console.log('🔄 Reconnecting to signaling server...')
        setTimeout(() => {
          if (!this.isDestroyed && this.peer) {
            this.peer.reconnect()
          }
        }, 1000)
      }
    })

    this.peer.on('error', (err: any) => {
      if (this.isDestroyed) return
      console.error('Peer error:', err.type, err.message)

      if (err.type === 'peer-unavailable') {
        if (!this.isHost) {
          this.setStatus('waiting', 'Esperando host...')
          setTimeout(() => {
            if (!this.isDestroyed) this.connectToPeer(hostPeerId)
          }, 3000) // Longer wait for slow networks
        }
      } else if (err.type === 'network' || err.type === 'server-error' || err.type === 'socket-error') {
        // Network issues - try to reconnect
        this.attemptReconnect(hostPeerId)
      }
    })
  }

  private callPeer(peerId: string): void {
    if (!this.peer || !this.localStream || this.isDestroyed) return

    // Only one media connection allowed - prevents duplicate streams
    if (this.mediaConnection || this.streamLocked) {
      console.log('📞 Already have active connection, skipping')
      return
    }

    console.log('📞 Calling peer:', peerId)
    const mediaConn = this.peer.call(peerId, this.localStream)
    this.setupMediaConnection(mediaConn)
  }

  private connectToPeer(hostPeerId: string): void {
    if (!this.peer || this.isDestroyed) return

    console.log('🔗 Connecting to:', hostPeerId)

    const dataConn = this.peer.connect(hostPeerId, {
      reliable: true,
      serialization: 'json'
    })
    this.setupDataConnection(dataConn)

    // Guest does NOT call host - wait for host to call us
    // This prevents duplicate streams and race conditions
  }

  private setupDataConnection(conn: DataConnection): void {
    this.dataConnection = conn

    conn.on('open', () => {
      if (this.isDestroyed) return
      console.log('✅ Data channel open')
      this.setStatus('connected', '¡Conectado!')
      this.reconnectAttempts = 0
      this.connectionStable = true
      this.lastStableConnection = Date.now()
      this.reconnectCooldown = false
      this.startPing()
      this.send({ type: 'join', name: this.userName, peerId: this.peer?.id })
    })

    conn.on('data', (data: any) => {
      if (this.isDestroyed) return

      if (data?.type === 'ping') {
        this.send({ type: 'pong' })
        return
      }
      if (data?.type === 'pong') return

      if (data?.type === 'join') {
        this.partnerName = data.name
        if (data.peerId) this.partnerPeerId = data.peerId
        this.callbacks.onPartnerJoined?.(data.name)
        this.send({ type: 'welcome', name: this.userName, peerId: this.peer?.id })
        return
      }
      if (data?.type === 'welcome') {
        this.partnerName = data.name
        if (data.peerId) this.partnerPeerId = data.peerId
        this.callbacks.onPartnerJoined?.(data.name)
        return
      }

      this.callbacks.onDataMessage?.(data)
    })

    conn.on('close', () => {
      if (this.isDestroyed) return
      console.log('📡 Data channel closed')

      // Don't immediately trigger disconnect - wait and check if media is still alive
      // Data channel can close temporarily during network hiccups
      setTimeout(() => {
        if (this.isDestroyed) return

        // If media stream is still active, don't disconnect
        if (this.activeRemoteStream && this.mediaConnection) {
          const tracks = this.activeRemoteStream.getTracks()
          const anyLive = tracks.some(t => t.readyState === 'live')
          if (anyLive) {
            console.log('📺 Media still alive after data channel close, waiting...')
            return
          }
        }

        // Data channel truly gone and no media - handle disconnect
        this.handlePartnerDisconnect()
      }, 5000) // Wait 5 seconds before deciding connection is lost
    })

    conn.on('error', (err) => {
      console.error('Data channel error:', err)
    })
  }

  private setupMediaConnection(call: MediaConnection): void {
    // Close any existing connection first
    if (this.mediaConnection) {
      try { this.mediaConnection.close() } catch {}
    }

    this.mediaConnection = call
    console.log('📺 Setting up media connection to:', call.peer)

    // Stream timeout - if no stream in 15s, report error
    const streamTimeout = setTimeout(() => {
      if (!this.activeRemoteStream && !this.isDestroyed) {
        console.warn('⚠️ No remote stream received within timeout')
        this.callbacks.onError?.('Video connection timeout - please retry')
      }
    }, 15000)

    call.on('stream', (remoteStream) => {
      if (this.isDestroyed) return

      // Clear stream timeout
      clearTimeout(streamTimeout)

      // CRITICAL: Deduplicate streams - only accept if different
      const streamId = remoteStream.id
      if (this.remoteStreamId === streamId) {
        console.log('📺 Same stream received, ignoring duplicate')
        return
      }

      console.log('📺 New remote stream received:', streamId)
      this.remoteStreamId = streamId
      this.activeRemoteStream = remoteStream
      this.streamLocked = true

      // Only fire callback once per unique stream
      this.callbacks.onRemoteStream?.(remoteStream)
    })

    call.on('close', () => {
      console.log('📞 Media connection closed')
      clearTimeout(streamTimeout)
      if (this.mediaConnection === call) {
        this.mediaConnection = null
        this.activeRemoteStream = null
        this.remoteStreamId = null
        this.streamLocked = false
      }
    })

    call.on('error', (err) => {
      console.error('Media connection error:', err)
      clearTimeout(streamTimeout)
    })

    // Monitor ICE state - be PATIENT with transient disconnections
    const pc = (call as any).peerConnection as RTCPeerConnection
    if (pc) {
      pc.oniceconnectionstatechange = () => {
        if (this.isDestroyed) return
        console.log('🧊 ICE state:', pc.iceConnectionState)

        // Only restart ICE on actual failure, not disconnected (which is transient)
        if (pc.iceConnectionState === 'failed') {
          console.log('🧊 ICE failed, attempting restart...')
          this.attemptIceRestart(pc)
        }

        // Disconnected is usually transient - wait 30 SECONDS before doing anything
        // Most networks recover within 10-15 seconds
        if (pc.iceConnectionState === 'disconnected') {
          if (this.iceRestartTimer) clearTimeout(this.iceRestartTimer)
          this.iceRestartTimer = setTimeout(() => {
            // Only restart if STILL disconnected after 30 seconds
            if (pc.iceConnectionState === 'disconnected' && !this.isDestroyed) {
              console.log('🧊 ICE still disconnected after 30s, attempting restart...')
              this.attemptIceRestart(pc)
            }
          }, 30000) // 30 seconds - much more patient
        }

        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
          // Connection recovered - clear any pending restart
          if (this.iceRestartTimer) {
            clearTimeout(this.iceRestartTimer)
            this.iceRestartTimer = null
          }
          this.connectionStable = true
          this.lastStableConnection = Date.now()
        }
      }

      pc.onconnectionstatechange = () => {
        if (this.isDestroyed) return
        console.log('🔌 Connection state:', pc.connectionState)
      }
    }
  }

  private attemptIceRestart(pc: RTCPeerConnection): void {
    try {
      if (pc.restartIce) {
        pc.restartIce()
        console.log('🧊 ICE restart initiated')
      }
    } catch (err) {
      console.error('ICE restart failed:', err)
    }
  }

  private handlePartnerDisconnect(): void {
    if (this.isDestroyed) return

    // Prevent rapid-fire disconnection handling
    if (this.reconnectCooldown) {
      console.log('⏳ Reconnect cooldown active, ignoring disconnect')
      return
    }

    // Check if we REALLY lost the connection or if it's just transient
    // If media stream is still active, don't trigger full disconnect
    if (this.activeRemoteStream && this.mediaConnection) {
      const videoTrack = this.activeRemoteStream.getVideoTracks()[0]
      if (videoTrack && videoTrack.readyState === 'live') {
        console.log('📺 Media stream still alive, ignoring data channel hiccup')
        return
      }
    }

    console.log('🔌 Partner disconnected - starting cooldown')
    this.reconnectCooldown = true

    // Only notify partner left if we're sure they're gone
    this.stopPing()
    this.callbacks.onPartnerLeft?.()
    this.activeRemoteStream = null
    this.remoteStreamId = null
    this.streamLocked = false
    this.mediaConnection = null

    if (this._status === 'connected' || this._status === 'reconnecting') {
      this.setStatus('reconnecting', 'Reconectando...')
      this.attemptReconnect(`vox-${this.mode}-${this.roomId}-host`)
    }

    // Cooldown for 10 seconds before allowing another disconnect handling
    setTimeout(() => {
      this.reconnectCooldown = false
    }, 10000)
  }

  private attemptReconnect(hostPeerId: string): void {
    if (this.isDestroyed) return
    if (this.reconnectAttempts >= this.maxReconnects) {
      this.setStatus('failed', 'Conexión perdida')
      return
    }

    this.reconnectAttempts++
    // Much longer delays - give network time to recover
    // Start at 5 seconds, max at 30 seconds
    const baseDelay = Math.min(5000 * Math.pow(1.5, this.reconnectAttempts - 1), 30000)
    const jitter = Math.random() * 2000
    const delay = baseDelay + jitter

    console.log(`🔄 Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnects} in ${Math.round(delay / 1000)}s`)
    this.setStatus('reconnecting', `Reconectando (${this.reconnectAttempts}/${this.maxReconnects})...`)

    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)

    this.reconnectTimer = setTimeout(() => {
      if (!this.isHost && this.peer && !this.isDestroyed) {
        // Clear existing connection state
        if (this.mediaConnection) {
          try { this.mediaConnection.close() } catch {}
          this.mediaConnection = null
        }
        this.streamLocked = false
        this.remoteStreamId = null
        this.connectToPeer(hostPeerId)
      }
    }, delay)
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HEALTH MONITORING - Keep connection alive on unreliable networks
  // ═══════════════════════════════════════════════════════════════════════════

  private startPing(): void {
    this.stopPing()
    this.pingInterval = setInterval(() => {
      if (this._status === 'connected' && !this.isDestroyed) {
        this.send({ type: 'ping' })
      }
    }, 20000) // Ping every 20 seconds - very relaxed to avoid false disconnects
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  private startConnectionCheck(): void {
    if (this.connectionCheckInterval) clearInterval(this.connectionCheckInterval)

    this.connectionCheckInterval = setInterval(() => {
      if (this.isDestroyed) return

      // Only check if we've been stable for at least 10 seconds
      // This prevents false positives during initial connection
      const timeSinceStable = Date.now() - this.lastStableConnection
      if (timeSinceStable < 10000) return

      if (this._status === 'connected') {
        // Only trigger disconnect if data connection is truly gone
        // AND we're not in a cooldown period
        if (!this.dataConnection || !this.dataConnection.open) {
          if (!this.reconnectCooldown) {
            console.log('⚠️ Data connection lost')
            this.handlePartnerDisconnect()
          }
        }
      }
    }, 30000) // Check every 30 seconds - much more relaxed
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  send(data: any): boolean {
    if (!this.dataConnection?.open || this.isDestroyed) return false
    try {
      this.dataConnection.send(data)
      return true
    } catch {
      return false
    }
  }

  replaceVideoTrack(track: MediaStreamTrack): void {
    if (!this.mediaConnection) return

    try {
      const pc = (this.mediaConnection as any)?.peerConnection as RTCPeerConnection
      if (pc) {
        const sender = pc.getSenders().find(s => s.track?.kind === 'video')
        if (sender) {
          console.log('🔄 Replacing video track')
          sender.replaceTrack(track).catch(err => {
            console.error('Failed to replace video track:', err)
          })
        }
      }
    } catch (err) {
      console.error('Error replacing video track:', err)
    }
  }

  disconnect(): void {
    console.log('🔌 Disconnecting...')
    this.isDestroyed = true
    this.stopPing()

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.connectionCheckInterval) {
      clearInterval(this.connectionCheckInterval)
      this.connectionCheckInterval = null
    }
    if (this.iceRestartTimer) {
      clearTimeout(this.iceRestartTimer)
      this.iceRestartTimer = null
    }

    if (this.mediaConnection) {
      try { this.mediaConnection.close() } catch {}
      this.mediaConnection = null
    }

    try { this.dataConnection?.close() } catch {}
    try { this.peer?.destroy() } catch {}

    this.peer = null
    this.dataConnection = null
    this.activeRemoteStream = null
    this.remoteStreamId = null
    this.streamLocked = false
  }

  private setStatus(status: ConnectionStatus, message?: string): void {
    if (this.isDestroyed) return
    this._status = status
    this.callbacks.onStatusChange?.(status, message)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEDIA HELPERS - Optimized for varying network conditions
// ═══════════════════════════════════════════════════════════════════════════════

export async function getCamera(facingMode: 'user' | 'environment' = 'user'): Promise<MediaStream> {
  // Try optimal settings first, fall back to more compatible settings
  const constraints = [
    // High quality for good connections
    {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 30 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000
      }
    },
    // Medium quality fallback
    {
      video: {
        facingMode: { ideal: facingMode },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24 }
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    },
    // Low quality for very slow connections
    {
      video: {
        facingMode: facingMode,
        width: { max: 480 },
        height: { max: 360 },
        frameRate: { max: 15 }
      },
      audio: true
    },
    // Absolute minimum
    { video: true, audio: true }
  ]

  for (const constraint of constraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraint)
    } catch (err: any) {
      console.warn('Camera constraint failed, trying fallback:', err.name)
      if (err.name === 'NotAllowedError') {
        throw new Error('Camera access denied. Please allow camera access.')
      }
      if (err.name === 'NotFoundError') {
        throw new Error('No camera found.')
      }
      // Try next constraint
    }
  }

  throw new Error('Could not access camera. Please check your device.')
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach(t => t.stop())
}
