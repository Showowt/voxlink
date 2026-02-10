'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { PeerConnection, getCamera, stopCamera } from '../../lib/peer-connection'

// ═══════════════════════════════════════════════════════════════════════════════
// VOXLINK VIDEO CALL - World's First Live Translation Video Call
// Beautiful, flowing captions with conversation history
// ═══════════════════════════════════════════════════════════════════════════════

type ConnectionStatus = 'initializing' | 'waiting' | 'connecting' | 'connected' | 'reconnecting' | 'failed'

interface TranscriptEntry {
  id: string
  speaker: 'me' | 'partner'
  name: string
  original: string
  translated: string
  timestamp: Date
  lang: 'en' | 'es'
}

function VideoCallContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()

  const roomId = params.id as string
  const isHost = searchParams.get('host') === 'true'
  const userName = searchParams.get('name') || 'User'
  const userLang = (searchParams.get('lang') || 'en') as 'en' | 'es'
  const targetLang = userLang === 'en' ? 'es' : 'en'

  // Connection state
  const [status, setStatus] = useState<ConnectionStatus>('initializing')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  // Media state
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user')

  // Translation state - live captions
  const [isListening, setIsListening] = useState(false)
  const [myLiveText, setMyLiveText] = useState('')
  const [myLiveTranslation, setMyLiveTranslation] = useState('')
  const [theirLiveText, setTheirLiveText] = useState('')
  const [theirLiveTranslation, setTheirLiveTranslation] = useState('')

  // Transcript history
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)

  // Caption settings
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [showSettings, setShowSettings] = useState(false)

  // UI state
  const [copied, setCopied] = useState(false)
  const [partnerName, setPartnerName] = useState('')

  // Refs
  const peerRef = useRef<PeerConnection | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const recognitionRef = useRef<any>(null)
  const isListeningRef = useRef(false)
  const mountedRef = useRef(true)
  const historyEndRef = useRef<HTMLDivElement>(null)
  const captionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const theirCaptionTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => { isListeningRef.current = isListening }, [isListening])

  // Auto-scroll history
  useEffect(() => {
    if (showHistory && historyEndRef.current) {
      historyEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [transcript, showHistory])

  // Font size classes
  const fontSizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-xl'
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // CONNECTION SETUP
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    mountedRef.current = true
    let peer: PeerConnection | null = null

    const init = async () => {
      try {
        setStatus('initializing')
        setStatusMessage('Starting camera...')

        const stream = await getCamera('user')
        if (!mountedRef.current) {
          stopCamera(stream)
          return
        }

        localStreamRef.current = stream

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream
          localVideoRef.current.play().catch(() => {})
        }

        peer = new PeerConnection({
          onStatusChange: (s, msg) => {
            if (!mountedRef.current) return
            setStatus(s)
            setStatusMessage(msg || '')
          },
          onRemoteStream: (remoteStream) => {
            if (!mountedRef.current) return
            if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
              remoteVideoRef.current.srcObject = remoteStream
              remoteVideoRef.current.play().catch(() => {})
            }
          },
          onDataMessage: (data) => {
            if (!mountedRef.current) return
            if (data?.type === 'caption') {
              // Live flowing caption from partner
              setTheirLiveText(data.text || '')
              setTheirLiveTranslation(data.translation || '')

              // Clear after 4 seconds of no updates
              if (theirCaptionTimeoutRef.current) clearTimeout(theirCaptionTimeoutRef.current)
              theirCaptionTimeoutRef.current = setTimeout(() => {
                if (mountedRef.current) {
                  setTheirLiveText('')
                  setTheirLiveTranslation('')
                }
              }, 4000)
            }
            if (data?.type === 'caption-final') {
              // Add to transcript
              addToTranscript('partner', partnerName || 'Partner', data.text, data.translation, targetLang as 'en' | 'es')
            }
          },
          onPartnerJoined: (name) => {
            if (!mountedRef.current) return
            setPartnerName(name)
          },
          onPartnerLeft: () => {
            if (!mountedRef.current) return
            setPartnerName('')
            setTheirLiveText('')
            setTheirLiveTranslation('')
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
          },
          onError: (err) => {
            if (!mountedRef.current) return
            setError(err)
          }
        })

        peerRef.current = peer
        await peer.connect(roomId, isHost, userName, 'video', stream)

      } catch (err: any) {
        if (mountedRef.current) {
          setError(err.message || 'Failed to start')
          setStatus('failed')
        }
      }
    }

    init()

    return () => {
      mountedRef.current = false
      isListeningRef.current = false
      stopListening()
      if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current)
      if (theirCaptionTimeoutRef.current) clearTimeout(theirCaptionTimeoutRef.current)
      peer?.disconnect()
      if (localStreamRef.current) stopCamera(localStreamRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, isHost, userName])

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSCRIPT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  const addToTranscript = useCallback((speaker: 'me' | 'partner', name: string, original: string, translated: string, lang: 'en' | 'es') => {
    if (!original.trim()) return

    const entry: TranscriptEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      speaker,
      name,
      original: original.trim(),
      translated: translated.trim(),
      timestamp: new Date(),
      lang
    }

    setTranscript(prev => [...prev, entry])
  }, [])

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSLATION WITH LIVE CAPTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  const translate = useCallback(async (text: string): Promise<string> => {
    try {
      const res = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, sourceLang: userLang, targetLang })
      })
      const data = await res.json()
      return data.translation || text
    } catch {
      return text
    }
  }, [userLang, targetLang])

  const startListening = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) {
      setError('Speech recognition not supported. Use Chrome.')
      return
    }

    const recognition = new SR()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = userLang === 'en' ? 'en-US' : 'es-ES'

    let finalizedText = ''
    let debounceTimer: NodeJS.Timeout | null = null

    recognition.onresult = async (e: any) => {
      if (!mountedRef.current) return

      let interim = ''
      let newFinal = ''

      for (let i = e.resultIndex; i < e.results.length; i++) {
        const transcript = e.results[i][0].transcript
        if (e.results[i].isFinal) {
          newFinal += transcript
        } else {
          interim = transcript
        }
      }

      // Current display text (finalized + current interim)
      const displayText = finalizedText + newFinal + interim
      setMyLiveText(displayText)

      // Debounce translation
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(async () => {
        if (displayText.trim() && mountedRef.current) {
          const translation = await translate(displayText.trim())
          if (mountedRef.current) {
            setMyLiveTranslation(translation)
            // Send live caption to partner
            peerRef.current?.send({
              type: 'caption',
              text: displayText.trim(),
              translation
            })
          }
        }
      }, 150) // Fast updates for smooth flow

      // When we get final text, add to transcript
      if (newFinal.trim()) {
        finalizedText += newFinal

        // Send final caption for transcript
        const translation = await translate(finalizedText.trim())
        peerRef.current?.send({
          type: 'caption-final',
          text: finalizedText.trim(),
          translation
        })
        addToTranscript('me', userName, finalizedText.trim(), translation, userLang)

        // Reset for next sentence after a pause
        if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current)
        captionTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            finalizedText = ''
            setMyLiveText('')
            setMyLiveTranslation('')
          }
        }, 3000)
      }
    }

    recognition.onerror = (e: any) => {
      if (e.error !== 'no-speech' && e.error !== 'aborted') {
        console.error('Speech error:', e.error)
      }
    }

    recognition.onend = () => {
      if (isListeningRef.current && mountedRef.current) {
        try { recognition.start() } catch {}
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
  }, [userLang, translate, addToTranscript, userName])

  const stopListening = useCallback(() => {
    setIsListening(false)
    try { recognitionRef.current?.stop() } catch {}
    recognitionRef.current = null
  }, [])

  // ═══════════════════════════════════════════════════════════════════════════
  // CONTROLS
  // ═══════════════════════════════════════════════════════════════════════════

  const toggleMute = () => {
    if (!localStreamRef.current) return
    const audioTrack = localStreamRef.current.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = isMuted
      setIsMuted(!isMuted)
    }
  }

  const toggleVideo = () => {
    if (!localStreamRef.current) return
    const videoTrack = localStreamRef.current.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = isVideoOff
      setIsVideoOff(!isVideoOff)
    }
  }

  const flipCamera = async () => {
    if (!localStreamRef.current) return
    try {
      const newFacing = facingMode === 'user' ? 'environment' : 'user'
      const newStream = await getCamera(newFacing)
      const newVideoTrack = newStream.getVideoTracks()[0]
      if (newVideoTrack) peerRef.current?.replaceVideoTrack(newVideoTrack)
      localStreamRef.current.getVideoTracks().forEach(t => t.stop())
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      localStreamRef.current = new MediaStream([newVideoTrack, ...(audioTrack ? [audioTrack] : [])])
      if (localVideoRef.current) localVideoRef.current.srcObject = localStreamRef.current
      setFacingMode(newFacing)
    } catch (err) {
      console.error('Failed to flip camera:', err)
    }
  }

  const endCall = () => {
    stopListening()
    peerRef.current?.disconnect()
    if (localStreamRef.current) stopCamera(localStreamRef.current)
    router.push('/')
  }

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/?join=call&id=${roomId}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isConnected = status === 'connected'
  const hasPartner = !!partnerName
  const statusColor = isConnected && hasPartner ? 'bg-green-500' :
    status === 'failed' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden relative">
      {/* Full screen video container */}
      <div className="flex-1 relative">
        {/* Remote video - full screen */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Gradient overlay for better caption readability */}
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />

        {/* Waiting state */}
        {!hasPartner && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0f]">
            <div className="text-center px-4">
              {status === 'failed' ? (
                <>
                  <div className="text-5xl mb-4">❌</div>
                  <p className="text-gray-400 mb-4">{error || 'Connection failed'}</p>
                  <button onClick={() => window.location.reload()} className="px-6 py-3 bg-cyan-500 text-white font-medium">
                    Try Again
                  </button>
                </>
              ) : (
                <>
                  <div className="w-20 h-20 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-6" />
                  <p className="text-white text-xl mb-2">
                    {statusMessage || (isHost ? 'Waiting for partner...' : 'Connecting...')}
                  </p>
                  {isHost && status === 'waiting' && (
                    <div className="mt-4 p-4 bg-white/10 backdrop-blur">
                      <p className="text-gray-400 text-sm mb-2">Share this code:</p>
                      <p className="text-cyan-400 text-3xl font-mono font-bold tracking-wider">{roomId}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Local video - Picture in Picture */}
        <div className="absolute top-4 right-4 w-32 h-44 md:w-40 md:h-56 bg-black/50 overflow-hidden shadow-2xl border border-white/20">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
          />
          {isVideoOff && (
            <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
              <span className="text-3xl">📵</span>
            </div>
          )}
          <div className="absolute bottom-0 inset-x-0 bg-black/60 px-2 py-1">
            <p className="text-white text-xs truncate">{userName} {userLang === 'en' ? '🇺🇸' : '🇪🇸'}</p>
          </div>
        </div>

        {/* Header bar */}
        <div className="absolute top-4 left-4 right-40 flex items-center gap-3">
          <div className="flex items-center gap-2 bg-black/50 backdrop-blur px-3 py-2">
            <div className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
            <span className="text-white text-sm font-medium">VoxLink</span>
            <span className="text-gray-400 text-xs font-mono">#{roomId}</span>
          </div>

          <button onClick={copyLink} className="bg-black/50 backdrop-blur px-3 py-2 text-cyan-400 text-sm">
            {copied ? '✓ Copied' : '🔗 Share'}
          </button>

          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`bg-black/50 backdrop-blur px-3 py-2 text-sm ${showHistory ? 'text-cyan-400' : 'text-white'}`}
          >
            📜 History {transcript.length > 0 && `(${transcript.length})`}
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`bg-black/50 backdrop-blur px-3 py-2 text-sm ${showSettings ? 'text-cyan-400' : 'text-white'}`}
          >
            ⚙️
          </button>
        </div>

        {/* Settings panel */}
        {showSettings && (
          <div className="absolute top-16 left-4 bg-black/80 backdrop-blur-xl border border-white/10 p-4 z-20">
            <p className="text-white text-sm font-medium mb-3">Caption Size</p>
            <div className="flex gap-2">
              {(['small', 'medium', 'large'] as const).map(size => (
                <button
                  key={size}
                  onClick={() => setFontSize(size)}
                  className={`px-3 py-2 text-sm capitalize ${
                    fontSize === size
                      ? 'bg-cyan-500 text-white'
                      : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* LIVE CAPTIONS - The Star of the Show */}
        {/* ═══════════════════════════════════════════════════════════════════ */}

        <div className="absolute bottom-24 inset-x-0 px-4 space-y-3 pointer-events-none">
          {/* Partner's caption */}
          {theirLiveText && (
            <div className="flex justify-start animate-fade-in">
              <div className="max-w-[85%] md:max-w-[70%]">
                <div className="bg-purple-500/20 backdrop-blur-xl border border-purple-500/30 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-purple-400 text-xs font-medium">{partnerName || 'Partner'}</span>
                    <span className="text-purple-400/50 text-xs">{targetLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
                  </div>
                  <p className={`text-white ${fontSizeClasses[fontSize]} leading-relaxed caption-text`}>
                    {theirLiveText}
                  </p>
                  {theirLiveTranslation && (
                    <p className={`text-cyan-300 ${fontSizeClasses[fontSize]} mt-2 leading-relaxed`}>
                      → {theirLiveTranslation}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* My caption */}
          {myLiveText && (
            <div className="flex justify-end animate-fade-in">
              <div className="max-w-[85%] md:max-w-[70%]">
                <div className="bg-cyan-500/20 backdrop-blur-xl border border-cyan-500/30 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-cyan-400 text-xs font-medium">You</span>
                    <span className="text-cyan-400/50 text-xs">{userLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
                    <div className="flex gap-0.5 ml-1">
                      {[0,1,2].map(i => (
                        <div key={i} className="w-1 h-2 bg-cyan-400 rounded-full animate-pulse" style={{animationDelay: `${i * 0.15}s`}} />
                      ))}
                    </div>
                  </div>
                  <p className={`text-white ${fontSizeClasses[fontSize]} leading-relaxed caption-text`}>
                    {myLiveText}
                    <span className="inline-block w-0.5 h-4 bg-white ml-1 animate-blink" />
                  </p>
                  {myLiveTranslation && (
                    <p className={`text-cyan-300 ${fontSizeClasses[fontSize]} mt-2 leading-relaxed`}>
                      → {myLiveTranslation}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Conversation History Panel */}
        {showHistory && (
          <div className="absolute top-16 left-4 bottom-28 w-80 md:w-96 bg-black/90 backdrop-blur-xl border border-white/10 flex flex-col z-10">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-white font-medium">Conversation History</h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {transcript.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">
                  Start speaking to see the conversation history
                </p>
              ) : (
                transcript.map(entry => (
                  <div
                    key={entry.id}
                    className={`p-3 ${
                      entry.speaker === 'me'
                        ? 'bg-cyan-500/10 border-l-2 border-cyan-500'
                        : 'bg-purple-500/10 border-l-2 border-purple-500'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${entry.speaker === 'me' ? 'text-cyan-400' : 'text-purple-400'}`}>
                        {entry.name}
                      </span>
                      <span className="text-gray-500 text-xs">
                        {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-white text-sm">{entry.original}</p>
                    <p className="text-gray-400 text-sm mt-1">→ {entry.translated}</p>
                  </div>
                ))
              )}
              <div ref={historyEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Controls bar */}
      <div className="bg-black/80 backdrop-blur-xl border-t border-white/10 px-4 py-4 safe-area-bottom">
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={toggleMute}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all ${
              isMuted ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            {isMuted ? '🔇' : '🎤'}
          </button>

          <button
            onClick={toggleVideo}
            className={`w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all ${
              isVideoOff ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            {isVideoOff ? '📵' : '📹'}
          </button>

          {/* Main translate button */}
          <button
            onClick={isListening ? stopListening : startListening}
            disabled={!isConnected}
            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all ${
              !isConnected
                ? 'bg-gray-700 text-gray-500'
                : isListening
                  ? 'bg-gradient-to-br from-green-400 to-emerald-600 text-white shadow-lg shadow-green-500/50'
                  : 'bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg shadow-cyan-500/50 hover:shadow-cyan-500/70'
            }`}
          >
            {isListening ? (
              <div className="flex items-center gap-1">
                {[0,1,2,3,4].map(i => (
                  <div
                    key={i}
                    className="w-1 bg-white rounded-full animate-soundwave"
                    style={{
                      height: `${14 + Math.sin(i * 0.8) * 10}px`,
                      animationDelay: `${i * 0.1}s`
                    }}
                  />
                ))}
              </div>
            ) : (
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V19h4v2H8v-2h4v-3.07z"/>
              </svg>
            )}
          </button>

          <button
            onClick={flipCamera}
            className="w-14 h-14 rounded-full bg-white/10 text-white flex items-center justify-center text-xl hover:bg-white/20 transition-all"
          >
            🔄
          </button>

          <button
            onClick={endCall}
            className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center text-xl hover:bg-red-600 transition-all"
          >
            📞
          </button>
        </div>

        <p className="text-center text-sm mt-3 text-gray-400">
          {!isConnected ? (
            statusMessage || 'Connecting...'
          ) : isListening ? (
            <span className="text-green-400 flex items-center justify-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Live Translating
            </span>
          ) : (
            'Tap the mic to start translating'
          )}
        </p>
      </div>

      {/* Custom styles */}
      <style jsx>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        @keyframes blink {
          0%, 50% { opacity: 1; }
          51%, 100% { opacity: 0; }
        }
        .animate-blink {
          animation: blink 1s infinite;
        }
        @keyframes soundwave {
          0%, 100% { transform: scaleY(0.5); }
          50% { transform: scaleY(1); }
        }
        .animate-soundwave {
          animation: soundwave 0.5s ease-in-out infinite;
        }
        .caption-text {
          text-shadow: 0 2px 4px rgba(0,0,0,0.5);
        }
        .safe-area-bottom {
          padding-bottom: max(1rem, env(safe-area-inset-bottom));
        }
      `}</style>
    </div>
  )
}

export default function VideoCallPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-16 h-16 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <VideoCallContent />
    </Suspense>
  )
}
