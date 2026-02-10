import Peer, { MediaConnection, DataConnection } from 'peerjs'

// ═══════════════════════════════════════════════════════════════════════════════
// BULLETPROOF CONNECTION MANAGER - Rock-Solid WebRTC Video
// Zero flickering, instant recovery, works on any network
// ═══════════════════════════════════════════════════════════════════════════════

export type ConnectionStatus =
  | 'initializing'
  | 'waiting'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'disconnected'

export type ConnectionQuality = 'excellent' | 'good' | 'fair' | 'poor'

export interface ConnectionCallbacks {
  onStatusChange?: (status: ConnectionStatus, message?: string) => void
  onRemoteStream?: (stream: MediaStream) => void
  onDataMessage?: (data: any) => void
  onError?: (error: string, recoverable: boolean) => void
  onQualityChange?: (quality: ConnectionQuality) => void
  onPeerConnected?: (peerId: string) => void
}

// ═══════════════════════════════════════════════════════════════════════════════
// ICE SERVERS - Multiple STUN + Free TURN for guaranteed connectivity
// ═══════════════════════════════════════════════════════════════════════════════

const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN servers (fast, reliable)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },

  // Twilio STUN (backup)
  { urls: 'stun:global.stun.twilio.com:3478' },

  // OpenRelay TURN servers (free, works behind strict NAT/firewalls)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },

  // Metered TURN (additional free tier)
  {
    urls: 'turn:a.relay.metered.ca:80',
    username: 'e8dd65f92ae85c9d4769ef17',
    credential: 'qwT3+nh8mHcOmX6f'
  },
  {
    urls: 'turn:a.relay.metered.ca:443',
    username: 'e8dd65f92ae85c9d4769ef17',
    credential: 'qwT3+nh8mHcOmX6f'
  },
  {
    urls: 'turn:a.relay.metered.ca:443?transport=tcp',
    username: 'e8dd65f92ae85c9d4769ef17',
    credential: 'qwT3+nh8mHcOmX6f'
  }
]

// ═══════════════════════════════════════════════════════════════════════════════
// CONNECTION MANAGER CLASS
// ═══════════════════════════════════════════════════════════════════════════════

export class ConnectionManager {
  private peer: Peer | null = null
  private currentCall: MediaConnection | null = null
  private dataConnection: DataConnection | null = null
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null

  // Aggressive reconnection
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10  // More attempts
  private reconnectTimeout: NodeJS.Timeout | null = null
  private isReconnecting = false

  // Connection monitoring - FASTER
  private statsInterval: NodeJS.Timeout | null = null
  private keepAliveInterval: NodeJS.Timeout | null = null
  private videoHealthInterval: NodeJS.Timeout | null = null
  private lastBytesReceived = 0
  private lastTimestamp = 0
  private lastPingTime = 0
  private lastPongTime = 0
  private consecutivePingFailures = 0

  // Video health monitoring
  private lastFrameCount = 0
  private lastFrameTime = 0
  private frozenFrameCount = 0
  private videoRestartAttempts = 0

  // Network monitoring
  private networkHandler: (() => void) | null = null
  private visibilityHandler: (() => void) | null = null
  private roomId: string = ''

  // ICE restart tracking
  private iceRestartAttempts = 0
  private maxIceRestarts = 5
  private lastIceRestart = 0

  // State
  private _status: ConnectionStatus = 'disconnected'
  private _quality: ConnectionQuality = 'good'
  private _peerId: string = ''
  private _remotePeerId: string = ''
  private _isHost: boolean = false

  // Callbacks
  private callbacks: ConnectionCallbacks = {}

  constructor(callbacks?: ConnectionCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PUBLIC GETTERS
  // ─────────────────────────────────────────────────────────────────────────────

  get status(): ConnectionStatus { return this._status }
  get quality(): ConnectionQuality { return this._quality }
  get peerId(): string { return this._peerId }
  get remotePeerId(): string { return this._remotePeerId }
  get isHost(): boolean { return this._isHost }
  get isConnected(): boolean { return this._status === 'connected' }
  get peerConnection(): RTCPeerConnection | null {
    return (this.currentCall as any)?.peerConnection || null
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // INITIALIZATION
  // ─────────────────────────────────────────────────────────────────────────────

  async initialize(roomId: string, isHost: boolean, localStream: MediaStream): Promise<boolean> {
    this._isHost = isHost
    this.localStream = localStream
    this.roomId = roomId

    // Generate peer ID based on role
    this._peerId = isHost ? `voxlink-${roomId}-host` : `voxlink-${roomId}-guest-${Date.now()}`
    this._remotePeerId = isHost ? '' : `voxlink-${roomId}-host`

    this.setStatus('initializing', 'Setting up connection...')

    // Set up all monitoring
    this.setupNetworkMonitoring()
    this.setupVisibilityMonitoring()

    try {
      // Create PeerJS instance with optimized config
      this.peer = new Peer(this._peerId, {
        config: {
          iceServers: ICE_SERVERS,
          iceCandidatePoolSize: 10,  // Pre-gather candidates
          bundlePolicy: 'max-bundle',
          rtcpMuxPolicy: 'require'
        },
        debug: 0
      })

      // Wait for peer to be ready
      await this.waitForPeerOpen()

      // Set up event listeners
      this.setupPeerListeners()

      if (isHost) {
        this.setStatus('waiting', 'Waiting for guest to join...')
      } else {
        this.setStatus('connecting', 'Connecting to host...')
        await this.connectToHost()
      }

      return true
    } catch (error: any) {
      console.error('Connection initialization error:', error)
      this.handleError(`Failed to initialize: ${error.message}`, true)
      return false
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // NETWORK & VISIBILITY MONITORING
  // ─────────────────────────────────────────────────────────────────────────────

  private setupNetworkMonitoring(): void {
    if (typeof window === 'undefined') return

    this.networkHandler = () => {
      if (navigator.onLine) {
        console.log('🌐 Network restored')
        if (this._status === 'reconnecting' || this._status === 'failed') {
          this.reconnectAttempts = 0
          this.iceRestartAttempts = 0
          this.attemptReconnect()
        }
      } else {
        console.log('🌐 Network lost')
        if (this._status === 'connected') {
          this.setStatus('reconnecting', 'Network connection lost...')
        }
      }
    }

    window.addEventListener('online', this.networkHandler)
    window.addEventListener('offline', this.networkHandler)
  }

  private setupVisibilityMonitoring(): void {
    if (typeof document === 'undefined') return

    this.visibilityHandler = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible - check connection health immediately
        console.log('👁️ Tab visible - checking connection')
        this.checkConnectionHealth()
      }
    }

    document.addEventListener('visibilitychange', this.visibilityHandler)
  }

  private cleanupMonitoring(): void {
    if (typeof window !== 'undefined') {
      if (this.networkHandler) {
        window.removeEventListener('online', this.networkHandler)
        window.removeEventListener('offline', this.networkHandler)
      }
    }
    if (typeof document !== 'undefined' && this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler)
    }
  }

  private waitForPeerOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.peer) {
        reject(new Error('Peer not created'))
        return
      }

      if (this.peer.open) {
        resolve()
        return
      }

      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout - peer server unreachable'))
      }, 10000)  // Faster timeout

      this.peer.on('open', () => {
        clearTimeout(timeout)
        resolve()
      })

      this.peer.on('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
    })
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // PEER EVENT LISTENERS
  // ─────────────────────────────────────────────────────────────────────────────

  private setupPeerListeners(): void {
    if (!this.peer) return

    this.peer.on('call', (call) => {
      console.log('📞 Incoming call from:', call.peer)
      this._remotePeerId = call.peer
      this.handleIncomingCall(call)
    })

    this.peer.on('connection', (conn) => {
      console.log('📡 Data connection from:', conn.peer)
      this.setupDataConnection(conn)
    })

    this.peer.on('error', (error: any) => {
      console.error('Peer error:', error)
      this.handlePeerError(error)
    })

    this.peer.on('disconnected', () => {
      console.log('⚠️ Disconnected from signaling server')
      if (this._status === 'connected') {
        // P2P still works, just reconnect signaling for future use
        setTimeout(() => this.peer?.reconnect(), 1000)
      }
    })

    this.peer.on('close', () => {
      console.log('🔴 Peer connection closed')
      this.setStatus('disconnected')
    })
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CALL HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  private async connectToHost(): Promise<void> {
    if (!this.peer || !this.localStream) {
      throw new Error('Peer or local stream not initialized')
    }

    // Create data connection first
    const dataConn = this.peer.connect(this._remotePeerId, {
      reliable: true,
      serialization: 'json'
    })
    this.setupDataConnection(dataConn)

    // Create media call
    const call = this.peer.call(this._remotePeerId, this.localStream)
    this.setupMediaConnection(call)
  }

  private handleIncomingCall(call: MediaConnection): void {
    if (!this.localStream) {
      console.error('No local stream to answer with')
      return
    }

    call.answer(this.localStream)
    this.setupMediaConnection(call)
    this.callbacks.onPeerConnected?.(call.peer)
  }

  private setupMediaConnection(call: MediaConnection): void {
    this.currentCall = call

    // Connection timeout - 15 seconds (was 30)
    const connectionTimeout = setTimeout(() => {
      if (this._status !== 'connected') {
        console.warn('⏱️ Connection timeout - no remote stream')
        this.attemptReconnect()
      }
    }, 15000)

    // Handle remote stream
    call.on('stream', (remoteStream) => {
      clearTimeout(connectionTimeout)
      console.log('📺 Received remote stream:', remoteStream.getTracks().map(t => `${t.kind}:${t.enabled}`))

      this.remoteStream = remoteStream
      this.setStatus('connected', 'Connected!')
      this.callbacks.onRemoteStream?.(remoteStream)

      // Set up track monitoring
      this.setupTrackMonitoring(remoteStream)

      // Start all monitoring
      this.startConnectionMonitoring()

      // Reset counters
      this.reconnectAttempts = 0
      this.iceRestartAttempts = 0
      this.frozenFrameCount = 0
      this.videoRestartAttempts = 0
      this.consecutivePingFailures = 0
    })

    call.on('close', () => {
      console.log('📞 Call closed')
      clearTimeout(connectionTimeout)
      this.handleCallClosed()
    })

    call.on('error', (error) => {
      console.error('Call error:', error)
      clearTimeout(connectionTimeout)
      this.handleError(`Call error: ${error.message}`, true)
    })

    // Monitor ICE and connection state
    const pc = (call as any).peerConnection as RTCPeerConnection | undefined
    if (pc) {
      this.setupPeerConnectionMonitoring(pc)
    }
  }

  private setupTrackMonitoring(stream: MediaStream): void {
    stream.getTracks().forEach(track => {
      track.onended = () => {
        console.warn(`⚠️ Track ended: ${track.kind}`)
        if (this._status === 'connected') {
          this.handleTrackEnded(track.kind)
        }
      }

      track.onmute = () => {
        console.warn(`🔇 Track muted: ${track.kind}`)
      }

      track.onunmute = () => {
        console.log(`🔊 Track unmuted: ${track.kind}`)
      }
    })

    // Monitor for track additions (reconnects)
    stream.onaddtrack = (event) => {
      console.log('➕ Track added:', event.track.kind)
      this.setupTrackMonitoring(new MediaStream([event.track]))
    }

    stream.onremovetrack = (event) => {
      console.warn('➖ Track removed:', event.track.kind)
    }
  }

  private handleTrackEnded(kind: string): void {
    console.log(`🔄 Handling ended ${kind} track`)

    if (kind === 'video') {
      this.videoRestartAttempts++
      if (this.videoRestartAttempts < 3) {
        // Try ICE restart first
        this.restartICE()
      } else {
        // Full reconnect
        this.attemptReconnect()
      }
    }
  }

  private setupPeerConnectionMonitoring(pc: RTCPeerConnection): void {
    pc.oniceconnectionstatechange = () => {
      console.log('🧊 ICE state:', pc.iceConnectionState)
      this.handleICEStateChange(pc.iceConnectionState, pc)
    }

    pc.onconnectionstatechange = () => {
      console.log('🔗 Connection state:', pc.connectionState)
      this.handleConnectionStateChange(pc.connectionState)
    }

    pc.onicecandidateerror = (event) => {
      console.warn('🧊 ICE candidate error:', event)
    }

    // Monitor signaling state for debugging
    pc.onsignalingstatechange = () => {
      console.log('📡 Signaling state:', pc.signalingState)
    }
  }

  private setupDataConnection(conn: DataConnection): void {
    this.dataConnection = conn

    conn.on('open', () => {
      console.log('📡 Data channel open')
    })

    conn.on('data', (data: any) => {
      if (data?.type === 'ping') {
        this.sendData({ type: 'pong', timestamp: data.timestamp })
        return
      }
      if (data?.type === 'pong') {
        this.lastPongTime = Date.now()
        this.consecutivePingFailures = 0
        return
      }
      this.callbacks.onDataMessage?.(data)
    })

    conn.on('close', () => {
      console.log('📡 Data channel closed')
    })

    conn.on('error', (error) => {
      console.error('Data channel error:', error)
    })
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONNECTION STATE HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  private handleICEStateChange(state: RTCIceConnectionState, pc: RTCPeerConnection): void {
    switch (state) {
      case 'checking':
        this.setStatus('connecting', 'Establishing connection...')
        break

      case 'connected':
      case 'completed':
        this.setStatus('connected')
        this.lastPongTime = Date.now()
        this.iceRestartAttempts = 0
        break

      case 'disconnected':
        // Give it 1 second to recover, then take action
        if (this._status === 'connected') {
          this.setStatus('reconnecting', 'Connection interrupted...')
          setTimeout(() => {
            if (this._status === 'reconnecting') {
              this.restartICE()
            }
          }, 1000)  // Faster reaction
        }
        break

      case 'failed':
        this.handleICEFailed(pc)
        break

      case 'closed':
        this.setStatus('disconnected')
        break
    }
  }

  private handleICEFailed(pc: RTCPeerConnection): void {
    console.log(`🧊 ICE failed, attempt ${this.iceRestartAttempts + 1}/${this.maxIceRestarts}`)

    if (this.iceRestartAttempts < this.maxIceRestarts) {
      this.restartICE()

      // Check if it worked after 3 seconds
      setTimeout(() => {
        if (this._status !== 'connected') {
          this.handleConnectionFailed()
        }
      }, 3000)
    } else {
      this.handleConnectionFailed()
    }
  }

  private handleConnectionStateChange(state: RTCPeerConnectionState): void {
    switch (state) {
      case 'connected':
        this.setStatus('connected')
        this.reconnectAttempts = 0
        this.iceRestartAttempts = 0
        break

      case 'disconnected':
        if (this._status === 'connected') {
          this.setStatus('reconnecting', 'Connection lost, reconnecting...')
          setTimeout(() => {
            if (this._status === 'reconnecting') {
              this.attemptReconnect()
            }
          }, 2000)
        }
        break

      case 'failed':
        this.handleConnectionFailed()
        break

      case 'closed':
        this.setStatus('disconnected')
        break
    }
  }

  private handleCallClosed(): void {
    this.stopConnectionMonitoring()

    if (this._status === 'connected' || this._status === 'reconnecting') {
      this.setStatus('reconnecting', 'Call ended, reconnecting...')
      this.attemptReconnect()
    }
  }

  private handleConnectionFailed(): void {
    this.stopConnectionMonitoring()

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.attemptReconnect()
    } else {
      this.setStatus('failed', 'Connection failed. Please try again.')
      this.handleError('Connection failed after multiple attempts', true)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ICE RESTART - Quick recovery without full reconnect
  // ─────────────────────────────────────────────────────────────────────────────

  private async restartICE(): Promise<void> {
    const pc = (this.currentCall as any)?.peerConnection as RTCPeerConnection | undefined
    if (!pc) return

    // Throttle ICE restarts
    const now = Date.now()
    if (now - this.lastIceRestart < 2000) {
      console.log('🧊 ICE restart throttled')
      return
    }

    this.lastIceRestart = now
    this.iceRestartAttempts++

    try {
      console.log(`🧊 Attempting ICE restart (${this.iceRestartAttempts}/${this.maxIceRestarts})`)
      pc.restartIce()
    } catch (error) {
      console.error('ICE restart failed:', error)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RECONNECTION LOGIC - More aggressive
  // ─────────────────────────────────────────────────────────────────────────────

  private attemptReconnect(): void {
    if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.setStatus('failed', 'Unable to reconnect. Please refresh.')
      }
      return
    }

    this.isReconnecting = true
    this.reconnectAttempts++

    // Faster backoff: 500ms, 1s, 2s, 4s...
    const delay = Math.min(500 * Math.pow(2, this.reconnectAttempts - 1), 8000)

    this.setStatus('reconnecting', `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    this.reconnectTimeout = setTimeout(async () => {
      this.isReconnecting = false

      try {
        // Close old call
        this.currentCall?.close()
        this.currentCall = null

        if (!this._isHost && this.peer && this.localStream) {
          await this.connectToHost()
        }
        // Host waits for guest to reconnect
      } catch (error) {
        console.error('Reconnect failed:', error)
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect()
        } else {
          this.setStatus('failed', 'Unable to reconnect. Please refresh.')
        }
      }
    }, delay)
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CONNECTION MONITORING - Faster and smarter
  // ─────────────────────────────────────────────────────────────────────────────

  private startConnectionMonitoring(): void {
    this.stopConnectionMonitoring()

    // Quality monitoring every 2 seconds (was 3)
    this.statsInterval = setInterval(() => {
      this.checkConnectionQuality()
    }, 2000)

    // Keep-alive every 5 seconds (was 10)
    this.keepAliveInterval = setInterval(() => {
      this.sendKeepAlive()
    }, 5000)

    // Video health check every 1 second
    this.videoHealthInterval = setInterval(() => {
      this.checkVideoHealth()
    }, 1000)
  }

  private stopConnectionMonitoring(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval)
      this.statsInterval = null
    }
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval)
      this.keepAliveInterval = null
    }
    if (this.videoHealthInterval) {
      clearInterval(this.videoHealthInterval)
      this.videoHealthInterval = null
    }
  }

  private sendKeepAlive(): void {
    if (this._status !== 'connected') return

    this.lastPingTime = Date.now()
    const sent = this.sendData({ type: 'ping', timestamp: this.lastPingTime })

    // Check for missing pongs - 15 seconds (was 30)
    if (this.lastPongTime > 0 && this.lastPingTime - this.lastPongTime > 15000) {
      this.consecutivePingFailures++
      console.warn(`⚠️ No pong in 15s (failures: ${this.consecutivePingFailures})`)

      if (this.consecutivePingFailures >= 2) {
        // Connection is likely dead
        this.restartICE()
      }
    }

    if (!sent) {
      console.warn('Failed to send keep-alive')
    }
  }

  private async checkVideoHealth(): Promise<void> {
    const pc = (this.currentCall as any)?.peerConnection as RTCPeerConnection | undefined
    if (!pc || this._status !== 'connected') return

    try {
      const stats = await pc.getStats()
      let framesDecoded = 0
      let framesReceived = 0

      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          framesDecoded = report.framesDecoded || 0
          framesReceived = report.framesReceived || 0
        }
      })

      const now = Date.now()
      const timeDiff = now - this.lastFrameTime

      // Check if frames are being received
      if (this.lastFrameCount > 0 && timeDiff > 0) {
        const framesDiff = framesDecoded - this.lastFrameCount
        const fps = (framesDiff / timeDiff) * 1000

        if (fps < 1 && framesDecoded > 0) {
          // Video appears frozen
          this.frozenFrameCount++
          console.warn(`🥶 Video frozen (count: ${this.frozenFrameCount}, fps: ${fps.toFixed(1)})`)

          if (this.frozenFrameCount >= 3) {
            // Video has been frozen for 3+ seconds
            console.log('🔄 Attempting to recover frozen video')
            this.frozenFrameCount = 0
            this.restartICE()
          }
        } else {
          // Video is flowing
          this.frozenFrameCount = 0
        }
      }

      this.lastFrameCount = framesDecoded
      this.lastFrameTime = now
    } catch (error) {
      // Stats not available - ignore
    }
  }

  private checkConnectionHealth(): void {
    if (this._status !== 'connected') return

    const pc = (this.currentCall as any)?.peerConnection as RTCPeerConnection | undefined
    if (!pc) return

    // Check ICE state
    if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
      console.log('🔍 Health check detected ICE issue')
      this.restartICE()
    }
  }

  private async checkConnectionQuality(): Promise<void> {
    const pc = (this.currentCall as any)?.peerConnection as RTCPeerConnection | undefined
    if (!pc) return

    try {
      const stats = await pc.getStats()
      let currentBytesReceived = 0
      let packetsLost = 0
      let packetsReceived = 0
      let jitter = 0
      let roundTripTime = 0

      stats.forEach((report) => {
        if (report.type === 'inbound-rtp' && report.kind === 'video') {
          currentBytesReceived = report.bytesReceived || 0
          packetsLost = report.packetsLost || 0
          packetsReceived = report.packetsReceived || 0
          jitter = report.jitter || 0
        }
        if (report.type === 'candidate-pair' && report.state === 'succeeded') {
          roundTripTime = report.currentRoundTripTime || 0
        }
      })

      // Calculate bitrate
      const now = Date.now()
      const timeDiff = (now - this.lastTimestamp) / 1000
      const bytesDiff = currentBytesReceived - this.lastBytesReceived
      const bitrate = timeDiff > 0 ? (bytesDiff * 8) / timeDiff : 0

      this.lastBytesReceived = currentBytesReceived
      this.lastTimestamp = now

      // Calculate packet loss
      const totalPackets = packetsReceived + packetsLost
      const lossPercent = totalPackets > 0 ? (packetsLost / totalPackets) * 100 : 0

      // Determine quality based on multiple factors
      let quality: ConnectionQuality = 'excellent'

      if (bitrate < 100000 || lossPercent > 10 || roundTripTime > 0.5 || jitter > 0.1) {
        quality = 'poor'
      } else if (bitrate < 300000 || lossPercent > 5 || roundTripTime > 0.3 || jitter > 0.05) {
        quality = 'fair'
      } else if (bitrate < 800000 || lossPercent > 2 || roundTripTime > 0.15) {
        quality = 'good'
      }

      if (quality !== this._quality) {
        this._quality = quality
        this.callbacks.onQualityChange?.(quality)

        // Proactively adapt when quality drops
        if (quality === 'poor' || quality === 'fair') {
          this.adaptBitrate(pc, quality)
        }
      }
    } catch (error) {
      // Stats error - ignore
    }
  }

  private async adaptBitrate(pc: RTCPeerConnection, quality: ConnectionQuality): Promise<void> {
    const sender = pc.getSenders().find(s => s.track?.kind === 'video')
    if (!sender) return

    try {
      const params = sender.getParameters()
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}]
      }

      // Aggressive adaptation
      if (quality === 'poor') {
        params.encodings[0].maxBitrate = 200000  // 200 kbps
        params.encodings[0].maxFramerate = 12
        params.encodings[0].scaleResolutionDownBy = 2  // Half resolution
      } else if (quality === 'fair') {
        params.encodings[0].maxBitrate = 400000  // 400 kbps
        params.encodings[0].maxFramerate = 20
        params.encodings[0].scaleResolutionDownBy = 1.5
      } else {
        // Good/excellent - full quality
        params.encodings[0].maxBitrate = 1500000  // 1.5 Mbps
        params.encodings[0].maxFramerate = 30
        delete params.encodings[0].scaleResolutionDownBy
      }

      await sender.setParameters(params)
      console.log(`📊 Adapted bitrate for ${quality} quality`)
    } catch (error) {
      // Adaptation failed - not critical
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // DATA CHANNEL
  // ─────────────────────────────────────────────────────────────────────────────

  sendData(data: any): boolean {
    if (!this.dataConnection || this.dataConnection.open !== true) {
      return false
    }

    try {
      this.dataConnection.send(data)
      return true
    } catch (error) {
      console.error('Error sending data:', error)
      return false
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // ERROR HANDLING
  // ─────────────────────────────────────────────────────────────────────────────

  private handlePeerError(error: any): void {
    const errorType = error.type || 'unknown'

    switch (errorType) {
      case 'browser-incompatible':
        this.handleError('Your browser does not support video calls.', false)
        break
      case 'disconnected':
        if (this._status !== 'connected') {
          this.handleError('Lost connection to server. Reconnecting...', true)
          this.attemptReconnect()
        }
        break
      case 'network':
        this.handleError('Network error. Check your connection.', true)
        break
      case 'peer-unavailable':
        if (!this._isHost) {
          this.handleError('Host not found. Check the code.', true)
        }
        break
      case 'ssl-unavailable':
        this.handleError('Secure connection required.', false)
        break
      case 'server-error':
        this.handleError('Server error. Retrying...', true)
        this.attemptReconnect()
        break
      case 'socket-error':
      case 'socket-closed':
        if (this._status !== 'connected') {
          this.attemptReconnect()
        }
        break
      case 'unavailable-id':
        this.handleError('Connection conflict. Please refresh.', true)
        break
      default:
        this.handleError(`Connection error: ${error.message || errorType}`, true)
    }
  }

  private handleError(message: string, recoverable: boolean): void {
    console.error('❌ Connection error:', message)
    this.callbacks.onError?.(message, recoverable)

    if (!recoverable) {
      this.setStatus('failed', message)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // STATUS MANAGEMENT
  // ─────────────────────────────────────────────────────────────────────────────

  private setStatus(status: ConnectionStatus, message?: string): void {
    if (this._status !== status) {
      console.log(`📶 Status: ${this._status} → ${status}`)
      this._status = status
      this.callbacks.onStatusChange?.(status, message)
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // CLEANUP
  // ─────────────────────────────────────────────────────────────────────────────

  disconnect(): void {
    this.stopConnectionMonitoring()
    this.cleanupMonitoring()

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.dataConnection) {
      this.dataConnection.close()
      this.dataConnection = null
    }

    if (this.currentCall) {
      this.currentCall.close()
      this.currentCall = null
    }

    if (this.peer) {
      this.peer.destroy()
      this.peer = null
    }

    this.localStream = null
    this.remoteStream = null
    this.reconnectAttempts = 0
    this.iceRestartAttempts = 0
    this.isReconnecting = false
    this.lastPingTime = 0
    this.lastPongTime = 0
    this.frozenFrameCount = 0
    this.videoRestartAttempts = 0
    this.consecutivePingFailures = 0

    this.setStatus('disconnected')
  }

  async retry(): Promise<boolean> {
    this.disconnect()
    this.reconnectAttempts = 0
    this.iceRestartAttempts = 0
    return false
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MEDIA HELPERS - Optimized for stable video
// ═══════════════════════════════════════════════════════════════════════════════

export interface MediaConstraints {
  video: MediaTrackConstraints | boolean
  audio: MediaTrackConstraints | boolean
}

export const getOptimalMediaConstraints = (facingMode: 'user' | 'environment' = 'user'): MediaConstraints => ({
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
    channelCount: 1
  }
})

export const getMediaStream = async (constraints: MediaConstraints): Promise<MediaStream> => {
  try {
    return await navigator.mediaDevices.getUserMedia(constraints)
  } catch (error: any) {
    if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
      throw new Error('Camera/microphone permission denied. Please allow access.')
    }
    if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
      throw new Error('No camera or microphone found.')
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      throw new Error('Camera/microphone in use by another app.')
    }
    if (error.name === 'OverconstrainedError') {
      // Fallback to basic constraints
      return await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true
      })
    }
    throw new Error(`Media access failed: ${error.message}`)
  }
}

export const stopMediaStream = (stream: MediaStream | null): void => {
  if (stream) {
    stream.getTracks().forEach(track => {
      track.stop()
    })
  }
}
