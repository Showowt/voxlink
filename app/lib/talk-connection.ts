import Peer, { DataConnection } from 'peerjs'

// ═══════════════════════════════════════════════════════════════════════════════
// TALK CONNECTION - Real-time data sync for Face-to-Face mode
// Uses PeerJS data channels for cross-device communication
// ═══════════════════════════════════════════════════════════════════════════════

export type TalkConnectionStatus = 'connecting' | 'waiting' | 'connected' | 'reconnecting' | 'failed'

export interface TalkMessage {
  type: 'message' | 'live' | 'presence' | 'emoji' | 'clear'
  data: any
}

export interface TalkConnectionCallbacks {
  onStatusChange?: (status: TalkConnectionStatus, message?: string) => void
  onMessage?: (message: TalkMessage) => void
  onPartnerConnected?: (name: string) => void
  onPartnerDisconnected?: () => void
}

// COMPREHENSIVE ICE SERVERS - Same as video for maximum compatibility
// Optimized for Latin America / Colombia - handles restrictive carriers
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
  // TCP fallback (works on restrictive mobile networks like Claro/Tigo)
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },

  // Additional TURN for redundancy
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

export class TalkConnection {
  private peer: Peer | null = null
  private dataConnection: DataConnection | null = null
  private _status: TalkConnectionStatus = 'connecting'
  private _isHost: boolean = false
  private _peerId: string = ''
  private _remotePeerId: string = ''
  private _partnerName: string = ''
  private _userName: string = ''
  private roomId: string = ''

  private callbacks: TalkConnectionCallbacks = {}
  private reconnectAttempts = 0
  private maxReconnectAttempts = 20 // More attempts for unreliable networks
  private reconnectTimeout: NodeJS.Timeout | null = null
  private keepAliveInterval: NodeJS.Timeout | null = null
  private isReconnecting = false

  constructor(callbacks?: TalkConnectionCallbacks) {
    if (callbacks) {
      this.callbacks = callbacks
    }
  }

  get status(): TalkConnectionStatus { return this._status }
  get isConnected(): boolean { return this._status === 'connected' }
  get partnerName(): string { return this._partnerName }

  async initialize(roomId: string, isHost: boolean, userName: string): Promise<boolean> {
    this._isHost = isHost
    this._userName = userName
    this.roomId = roomId

    this._peerId = isHost ? `vox-talk-${roomId}-host` : `vox-talk-${roomId}-guest-${Date.now()}`
    this._remotePeerId = isHost ? '' : `vox-talk-${roomId}-host`

    this.setStatus('connecting', 'Connecting...')

    try {
      this.peer = new Peer(this._peerId, {
        config: {
          iceServers: ICE_SERVERS,
          iceCandidatePoolSize: 10
        },
        debug: 0
      })

      await this.waitForPeerOpen()
      this.setupPeerListeners()

      if (isHost) {
        this.setStatus('waiting', 'Waiting for partner...')
      } else {
        this.setStatus('connecting', 'Connecting to partner...')
        this.connectToHost()
      }

      return true
    } catch (error: any) {
      console.error('Talk connection error:', error)
      this.setStatus('failed', error.message)
      return false
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
        reject(new Error('Connection timeout'))
      }, 30000) // 30s timeout for slow networks

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

  private setupPeerListeners(): void {
    if (!this.peer) return

    this.peer.on('connection', (conn) => {
      console.log('📡 Partner connecting:', conn.peer)
      this._remotePeerId = conn.peer
      this.setupDataConnection(conn)
    })

    this.peer.on('error', (error: any) => {
      console.error('Peer error:', error)
      if (error.type === 'peer-unavailable' && !this._isHost) {
        this.setStatus('waiting', 'Waiting for host to start...')
        setTimeout(() => this.connectToHost(), 2000)
      } else if (this._status !== 'connected') {
        this.attemptReconnect()
      }
    })

    this.peer.on('disconnected', () => {
      if (this._status === 'connected') {
        this.peer?.reconnect()
      }
    })
  }

  private connectToHost(): void {
    if (!this.peer || !this._remotePeerId) return

    const conn = this.peer.connect(this._remotePeerId, {
      reliable: true,
      serialization: 'json'
    })
    this.setupDataConnection(conn)
  }

  private setupDataConnection(conn: DataConnection): void {
    this.dataConnection = conn

    conn.on('open', () => {
      console.log('📡 Data channel open')
      this.setStatus('connected', 'Connected!')
      this.reconnectAttempts = 0
      this.startKeepAlive()

      // Send our name
      this.send({ type: 'presence', data: { name: this._userName, action: 'join' } })
    })

    conn.on('data', (data: any) => {
      if (data?.type === 'ping') {
        this.send({ type: 'pong' as any, data: {} })
        return
      }
      if (data?.type === 'pong') {
        return
      }
      if (data?.type === 'presence') {
        if (data.data.action === 'join') {
          this._partnerName = data.data.name
          this.callbacks.onPartnerConnected?.(data.data.name)
          // Send our name back
          this.send({ type: 'presence', data: { name: this._userName, action: 'ack' } })
        } else if (data.data.action === 'ack') {
          this._partnerName = data.data.name
          this.callbacks.onPartnerConnected?.(data.data.name)
        }
        return
      }

      this.callbacks.onMessage?.(data as TalkMessage)
    })

    conn.on('close', () => {
      console.log('📡 Data channel closed')
      this.stopKeepAlive()
      this.callbacks.onPartnerDisconnected?.()
      if (this._status === 'connected') {
        this.setStatus('reconnecting', 'Partner disconnected, reconnecting...')
        this.attemptReconnect()
      }
    })

    conn.on('error', (error) => {
      console.error('Data channel error:', error)
    })
  }

  private startKeepAlive(): void {
    this.stopKeepAlive()
    this.keepAliveInterval = setInterval(() => {
      if (this._status === 'connected') {
        this.send({ type: 'ping' as any, data: {} })
      }
    }, 5000)
  }

  private stopKeepAlive(): void {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval)
      this.keepAliveInterval = null
    }
  }

  private attemptReconnect(): void {
    if (this.isReconnecting || this.reconnectAttempts >= this.maxReconnectAttempts) {
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        this.setStatus('failed', 'Connection failed')
      }
      return
    }

    this.isReconnecting = true
    this.reconnectAttempts++

    const delay = Math.min(500 * Math.pow(2, this.reconnectAttempts - 1), 8000)
    this.setStatus('reconnecting', `Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    this.reconnectTimeout = setTimeout(() => {
      this.isReconnecting = false

      if (!this._isHost && this.peer) {
        this.connectToHost()
      }
    }, delay)
  }

  send(message: TalkMessage): boolean {
    if (!this.dataConnection || this.dataConnection.open !== true) {
      return false
    }

    try {
      this.dataConnection.send(message)
      return true
    } catch (error) {
      console.error('Send error:', error)
      return false
    }
  }

  private setStatus(status: TalkConnectionStatus, message?: string): void {
    this._status = status
    this.callbacks.onStatusChange?.(status, message)
  }

  disconnect(): void {
    this.stopKeepAlive()

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.dataConnection) {
      this.dataConnection.close()
      this.dataConnection = null
    }

    if (this.peer) {
      this.peer.destroy()
      this.peer = null
    }

    this.reconnectAttempts = 0
    this.isReconnecting = false
  }
}
