import Peer, { MediaConnection, DataConnection } from 'peerjs'

// ═══════════════════════════════════════════════════════════════════════════════
// VOXLINK PEER CONNECTION v2 - FaceTime-Level Reliability
// Fixed: Room signaling to ensure host/guest always find each other
// ═══════════════════════════════════════════════════════════════════════════════

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

// Reliable ICE configuration with multiple STUN/TURN servers
const ICE_SERVERS: RTCIceServer[] = [
  // Google STUN servers (free, reliable)
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // OpenRelay TURN (free, for NAT traversal)
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
  }
]

// Generate unique peer ID with timestamp
function generatePeerId(roomId: string, role: 'host' | 'guest'): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 6)
  return `voxlink-${roomId}-${role}-${timestamp}-${random}`
}

export class PeerConnection {
  private peer: Peer | null = null
  private dataConnection: DataConnection | null = null
  private mediaConnection: MediaConnection | null = null
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null

  private mode: ConnectionMode = 'video'
  private roomId: string = ''
  private isHost: boolean = false
  private userName: string = ''
  private myPeerId: string = ''
  private partnerPeerId: string = ''

  private _status: ConnectionStatus = 'initializing'
  private callbacks: PeerCallbacks = {}
  private destroyed: boolean = false
  private connectionAttempts: number = 0
  private maxConnectionAttempts: number = 5
  private pollingInterval: NodeJS.Timeout | null = null

  constructor(callbacks: PeerCallbacks) {
    this.callbacks = callbacks
  }

  get status() { return this._status }
  get isConnected() { return this._status === 'connected' }

  // ═══════════════════════════════════════════════════════════════════════════
  // MAIN CONNECTION FLOW
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
    this.destroyed = false
    this.connectionAttempts = 0

    this.setStatus('initializing', 'Iniciando...')

    try {
      // Generate unique peer ID
      this.myPeerId = generatePeerId(roomId, isHost ? 'host' : 'guest')
      console.log('🆔 My peer ID:', this.myPeerId)

      // Create peer with config
      await this.createPeer()

      if (isHost) {
        // Host: Register with signaling API and wait
        await this.registerAsHost()
        this.setStatus('waiting', 'Esperando...')
        this.setupPeerListeners()
      } else {
        // Guest: Look up host and connect
        this.setStatus('connecting', 'Buscando anfitrión...')
        this.setupPeerListeners()
        await this.findAndConnectToHost()
      }

      return true
    } catch (err: any) {
      console.error('❌ Connection failed:', err)
      this.setStatus('failed', err.message)
      this.callbacks.onError?.(err.message)
      return false
    }
  }

  private async createPeer(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Timeout connecting to signaling server'))
      }, 15000)

      try {
        this.peer = new Peer(this.myPeerId, {
          config: { iceServers: ICE_SERVERS },
          debug: 1
        })

        this.peer.on('open', (id) => {
          clearTimeout(timeout)
          console.log('✅ Peer ready:', id)
          resolve()
        })

        this.peer.on('error', (err: any) => {
          console.error('❌ Peer error:', err.type, err.message)

          // If ID is taken (shouldn't happen with unique IDs but just in case)
          if (err.type === 'unavailable-id') {
            clearTimeout(timeout)
            // Generate new ID and retry
            this.myPeerId = generatePeerId(this.roomId, this.isHost ? 'host' : 'guest')
            console.log('🔄 ID taken, retrying with:', this.myPeerId)

            this.peer = new Peer(this.myPeerId, {
              config: { iceServers: ICE_SERVERS },
              debug: 1
            })

            this.peer.on('open', () => {
              resolve()
            })

            this.peer.on('error', (e) => {
              reject(e)
            })
          } else if (err.type === 'network' || err.type === 'server-error') {
            clearTimeout(timeout)
            reject(new Error('Cannot connect to signaling server'))
          }
          // Other errors handled in setupPeerListeners
        })
      } catch (err) {
        clearTimeout(timeout)
        reject(err)
      }
    })
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // HOST REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  private async registerAsHost(): Promise<void> {
    try {
      const response = await fetch('/api/room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: this.roomId,
          hostPeerId: this.myPeerId,
          hostName: this.userName
        })
      })

      if (!response.ok) {
        throw new Error('Failed to register room')
      }

      const data = await response.json()
      console.log('📍 Room registered:', data)
    } catch (err) {
      console.error('Room registration failed:', err)
      // Continue anyway - guest might still connect via polling
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GUEST: FIND AND CONNECT TO HOST
  // ═══════════════════════════════════════════════════════════════════════════

  private async findAndConnectToHost(): Promise<void> {
    const lookupHost = async (): Promise<string | null> => {
      try {
        const response = await fetch(`/api/room?roomId=${encodeURIComponent(this.roomId)}`)
        const data = await response.json()

        if (data.found && data.hostPeerId) {
          console.log('📍 Found host:', data.hostPeerId)
          return data.hostPeerId
        }
        return null
      } catch (err) {
        console.error('Host lookup failed:', err)
        return null
      }
    }

    // Try to find host with retries
    const findHost = async (): Promise<string> => {
      for (let attempt = 1; attempt <= this.maxConnectionAttempts; attempt++) {
        if (this.destroyed) throw new Error('Connection cancelled')

        this.setStatus('connecting', `Buscando... (${attempt}/${this.maxConnectionAttempts})`)

        const hostPeerId = await lookupHost()
        if (hostPeerId) {
          return hostPeerId
        }

        // Wait before retry (increasing delay)
        const delay = Math.min(1000 * attempt, 3000)
        await new Promise(r => setTimeout(r, delay))
      }

      throw new Error('Host not found. They may not have joined yet.')
    }

    try {
      this.partnerPeerId = await findHost()
      this.connectToPeer(this.partnerPeerId)
    } catch (err: any) {
      this.setStatus('failed', err.message)
      this.callbacks.onError?.(err.message)
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PEER CONNECTION SETUP
  // ═══════════════════════════════════════════════════════════════════════════

  private setupPeerListeners(): void {
    if (!this.peer) return

    // Handle incoming data connection (host receives this from guest)
    this.peer.on('connection', (conn) => {
      if (this.destroyed) return
      console.log('📡 Incoming data connection from:', conn.peer)
      this.partnerPeerId = conn.peer
      this.handleDataConnection(conn)
    })

    // Handle incoming media call
    this.peer.on('call', (call) => {
      if (this.destroyed) return
      console.log('📞 Incoming call from:', call.peer)

      // Answer with our stream
      if (this.localStream) {
        console.log('📞 Answering with our stream...')
        call.answer(this.localStream)
      } else {
        console.log('📞 Answering without stream (audio only mode)')
        call.answer()
      }

      this.handleMediaConnection(call)
    })

    // Handle disconnection from signaling server
    this.peer.on('disconnected', () => {
      if (this.destroyed) return
      console.log('⚠️ Disconnected from signaling server')

      // Try to reconnect to signaling server
      setTimeout(() => {
        if (!this.destroyed && this.peer && !this.peer.destroyed) {
          console.log('🔄 Reconnecting to signaling server...')
          this.peer.reconnect()
        }
      }, 1000)
    })

    // Handle peer errors
    this.peer.on('error', (err: any) => {
      if (this.destroyed) return
      console.error('Peer error:', err.type, err.message)

      // Only handle peer-unavailable for non-hosts who are actively connecting
      if (err.type === 'peer-unavailable' && !this.isHost && this.partnerPeerId) {
        this.connectionAttempts++
        console.log(`⚠️ Peer unavailable, attempt ${this.connectionAttempts}/${this.maxConnectionAttempts}`)

        if (this.connectionAttempts < this.maxConnectionAttempts) {
          // Wait and retry looking up the host
          setTimeout(() => {
            if (!this.destroyed) {
              this.findAndConnectToHost()
            }
          }, 2000)
        } else {
          this.setStatus('failed', 'Could not reach host')
          this.callbacks.onError?.('Could not reach host')
        }
      }
    })
  }

  private connectToPeer(peerId: string): void {
    if (!this.peer || this.destroyed) return

    console.log('🔗 Connecting to peer:', peerId)
    this.setStatus('connecting', 'Conectando...')

    // Create data connection first
    const conn = this.peer.connect(peerId, { reliable: true })
    this.handleDataConnection(conn)
  }

  private handleDataConnection(conn: DataConnection): void {
    // Don't close existing connection if it's the same peer
    if (this.dataConnection && this.dataConnection.peer === conn.peer && this.dataConnection.open) {
      console.log('📡 Already connected to this peer, ignoring duplicate')
      return
    }

    // Close old connection if it exists
    if (this.dataConnection && this.dataConnection.peer !== conn.peer) {
      try { this.dataConnection.close() } catch {}
    }

    this.dataConnection = conn

    conn.on('open', () => {
      if (this.destroyed) return
      console.log('✅ Data channel open!')

      // Mark as connected
      this.setStatus('connected', '¡Conectado!')

      // Send hello
      this.send({ type: 'hello', name: this.userName, peerId: this.myPeerId })

      // If we're the guest, initiate the video call
      if (!this.isHost && this.localStream) {
        console.log('📞 Guest initiating video call...')
        this.initiateCall()
      }
    })

    conn.on('data', (data: any) => {
      if (this.destroyed) return

      // Handle hello messages
      if (data?.type === 'hello') {
        console.log('👋 Partner joined:', data.name)
        this.callbacks.onPartnerJoined?.(data.name)

        // Send hello back if we haven't already
        this.send({ type: 'hello', name: this.userName, peerId: this.myPeerId })

        // If we're host and have video, call the guest
        if (this.isHost && this.localStream && !this.mediaConnection) {
          console.log('📞 Host initiating video call to guest...')
          setTimeout(() => this.initiateCall(), 500)
        }
        return
      }

      // Forward other messages to callback
      this.callbacks.onDataMessage?.(data)
    })

    conn.on('close', () => {
      if (this.destroyed) return
      console.log('📡 Data channel closed')
      this.handleDisconnect()
    })

    conn.on('error', (err) => {
      console.error('Data channel error:', err)
    })
  }

  private initiateCall(): void {
    if (!this.peer || !this.partnerPeerId || this.destroyed) return

    // Don't create duplicate calls
    if (this.mediaConnection && !this.mediaConnection.open) {
      console.log('📞 Call already in progress, skipping')
      return
    }

    console.log('📞 Calling peer:', this.partnerPeerId)

    if (this.localStream) {
      const call = this.peer.call(this.partnerPeerId, this.localStream)
      this.handleMediaConnection(call)
    }
  }

  private handleMediaConnection(call: MediaConnection): void {
    // Avoid duplicate media connections
    if (this.mediaConnection?.peer === call.peer) {
      console.log('📺 Already have media connection to this peer')
      return
    }

    // Close old connection
    if (this.mediaConnection) {
      try { this.mediaConnection.close() } catch {}
    }

    this.mediaConnection = call
    console.log('📺 Setting up media connection with:', call.peer)

    call.on('stream', (stream) => {
      if (this.destroyed) return

      // Avoid duplicate stream events
      if (this.remoteStream?.id === stream.id) {
        console.log('📺 Same stream received, ignoring')
        return
      }

      console.log('📺 GOT REMOTE STREAM!')
      console.log('   Video tracks:', stream.getVideoTracks().length)
      console.log('   Audio tracks:', stream.getAudioTracks().length)

      this.remoteStream = stream
      this.callbacks.onRemoteStream?.(stream)
    })

    call.on('close', () => {
      console.log('📞 Media connection closed')
      this.remoteStream = null
    })

    call.on('error', (err) => {
      console.error('Media connection error:', err)
    })

    // Monitor ICE connection state
    const pc = (call as any).peerConnection as RTCPeerConnection
    if (pc) {
      pc.oniceconnectionstatechange = () => {
        console.log('🧊 ICE state:', pc.iceConnectionState)

        if (pc.iceConnectionState === 'failed') {
          console.log('🧊 ICE failed, attempting ICE restart...')
          // Try ICE restart
          pc.restartIce?.()
        }

        if (pc.iceConnectionState === 'disconnected') {
          console.log('🧊 ICE disconnected, waiting for recovery...')
          // Give it time to recover before taking action
          setTimeout(() => {
            if (pc.iceConnectionState === 'disconnected' && !this.destroyed) {
              console.log('🧊 ICE still disconnected, restarting...')
              pc.restartIce?.()
            }
          }, 3000)
        }
      }

      pc.onconnectionstatechange = () => {
        console.log('🔌 Connection state:', pc.connectionState)
      }
    }
  }

  private handleDisconnect(): void {
    if (this.destroyed) return

    console.log('🔌 Partner disconnected')
    this.callbacks.onPartnerLeft?.()
    this.remoteStream = null
    this.setStatus('failed', 'Conexión perdida')
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PUBLIC METHODS
  // ═══════════════════════════════════════════════════════════════════════════

  send(data: any): boolean {
    if (!this.dataConnection?.open || this.destroyed) return false
    try {
      this.dataConnection.send(data)
      return true
    } catch {
      return false
    }
  }

  replaceVideoTrack(track: MediaStreamTrack): void {
    const pc = (this.mediaConnection as any)?.peerConnection as RTCPeerConnection
    if (!pc) return

    const sender = pc.getSenders().find(s => s.track?.kind === 'video')
    if (sender) {
      sender.replaceTrack(track).catch(err => {
        console.error('Failed to replace video track:', err)
      })
    }
  }

  disconnect(): void {
    console.log('🔌 Disconnecting...')
    this.destroyed = true

    // Clear any polling
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }

    // Clean up room registration
    if (this.isHost) {
      fetch(`/api/room?roomId=${encodeURIComponent(this.roomId)}`, {
        method: 'DELETE'
      }).catch(() => {})
    }

    try { this.mediaConnection?.close() } catch {}
    try { this.dataConnection?.close() } catch {}
    try { this.peer?.destroy() } catch {}

    this.peer = null
    this.dataConnection = null
    this.mediaConnection = null
    this.remoteStream = null
  }

  private setStatus(status: ConnectionStatus, message?: string): void {
    if (this.destroyed) return
    this._status = status
    this.callbacks.onStatusChange?.(status, message)
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// CAMERA HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

export async function getCamera(facingMode: 'user' | 'environment' = 'user'): Promise<MediaStream> {
  const constraints = [
    // Try HD first
    {
      video: { facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    },
    // Fallback to SD
    {
      video: { facingMode, width: { ideal: 640 }, height: { ideal: 480 } },
      audio: { echoCancellation: true, noiseSuppression: true }
    },
    // Absolute minimum
    { video: true, audio: true }
  ]

  for (const constraint of constraints) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraint)
      console.log('📷 Camera acquired:', {
        video: stream.getVideoTracks()[0]?.getSettings(),
        audio: stream.getAudioTracks()[0]?.getSettings()
      })
      return stream
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        throw new Error('Camera access denied. Please allow camera access.')
      }
      if (err.name === 'NotFoundError') {
        throw new Error('No camera found on this device.')
      }
      // Try next constraint
    }
  }

  throw new Error('Could not access camera')
}

export function stopCamera(stream: MediaStream | null): void {
  stream?.getTracks().forEach(t => t.stop())
}
