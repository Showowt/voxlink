'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import DailyIframe, { DailyCall } from '@daily-co/daily-js'

// ═══════════════════════════════════════════════════════════════════════════════
// VOXLINK VIDEO CALL - Powered by Daily.co
// Enterprise-grade video with live translation
// ═══════════════════════════════════════════════════════════════════════════════

type CallStatus = 'loading' | 'joining' | 'connected' | 'error'

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

  const roomCode = params.id as string
  const isHost = searchParams.get('host') === 'true'
  const userName = searchParams.get('name') || 'User'
  const userLang = (searchParams.get('lang') || 'en') as 'en' | 'es'
  const targetLang = userLang === 'en' ? 'es' : 'en'

  // State
  const [status, setStatus] = useState<CallStatus>('loading')
  const [statusMessage, setStatusMessage] = useState('Iniciando...')
  const [error, setError] = useState<string | null>(null)
  const [roomUrl, setRoomUrl] = useState<string | null>(null)
  const [participantCount, setParticipantCount] = useState(0)
  const [partnerName, setPartnerName] = useState('')

  // Media state
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOff, setIsVideoOff] = useState(false)

  // Translation state
  const [isListening, setIsListening] = useState(false)
  const [myLiveText, setMyLiveText] = useState('')
  const [myLiveTranslation, setMyLiveTranslation] = useState('')
  const [theirLiveText, setTheirLiveText] = useState('')
  const [theirLiveTranslation, setTheirLiveTranslation] = useState('')
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [fontSize, setFontSize] = useState<'small' | 'medium' | 'large'>('medium')

  // UI state
  const [copied, setCopied] = useState(false)

  // Refs
  const callRef = useRef<DailyCall | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const recognitionRef = useRef<any>(null)
  const isListeningRef = useRef(false)
  const mountedRef = useRef(true)
  const captionTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const theirCaptionTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => { isListeningRef.current = isListening }, [isListening])

  const fontSizeClasses = {
    small: 'text-sm',
    medium: 'text-base',
    large: 'text-xl'
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // DAILY.CO SETUP
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    mountedRef.current = true
    let call: DailyCall | null = null

    const init = async () => {
      try {
        setStatus('loading')
        setStatusMessage(isHost ? 'Creando sala...' : 'Buscando sala...')

        let dailyRoomUrl: string

        if (isHost) {
          // Create room via API
          const res = await fetch('/api/daily/create-room', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomName: `voxlink-${roomCode}` })
          })

          if (!res.ok) {
            const err = await res.json()
            throw new Error(err.error || 'Failed to create room')
          }

          const room = await res.json()
          dailyRoomUrl = room.url
          console.log('✅ Room created:', dailyRoomUrl)
        } else {
          // Check if room exists
          const res = await fetch(`/api/daily/create-room?room=voxlink-${roomCode}`)
          const data = await res.json()

          if (!data.exists) {
            throw new Error('Room not found. Check the code and try again.')
          }

          dailyRoomUrl = data.url
        }

        setRoomUrl(dailyRoomUrl)
        setStatus('joining')
        setStatusMessage('Conectando...')

        // Create Daily call
        call = DailyIframe.createCallObject({
          videoSource: true,
          audioSource: true,
        })
        callRef.current = call

        // Set up event listeners
        call.on('joining-meeting', () => {
          console.log('🔄 Joining meeting...')
          setStatusMessage('Entrando...')
        })

        call.on('joined-meeting', () => {
          console.log('✅ Joined meeting!')
          setStatus('connected')
          setStatusMessage('¡Conectado!')
          updateLocalVideo()
        })

        call.on('participant-joined', (event) => {
          console.log('👋 Participant joined:', event?.participant?.user_name)
          updateParticipants()
          if (event?.participant?.user_name && !event.participant.local) {
            setPartnerName(event.participant.user_name)
          }
        })

        call.on('participant-left', () => {
          console.log('👋 Participant left')
          updateParticipants()
          setPartnerName('')
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = null
          }
        })

        call.on('participant-updated', () => {
          updateParticipants()
          updateRemoteVideo()
        })

        call.on('track-started', (event) => {
          console.log('📺 Track started:', event?.track?.kind)
          if (event?.participant?.local) {
            updateLocalVideo()
          } else {
            updateRemoteVideo()
          }
        })

        call.on('error', (event) => {
          console.error('❌ Daily error:', event)
          setError(event?.errorMsg || 'Connection error')
          setStatus('error')
        })

        call.on('left-meeting', () => {
          console.log('👋 Left meeting')
        })

        // Handle app messages (for captions)
        call.on('app-message', (event) => {
          if (!mountedRef.current) return
          const data = event?.data

          if (data?.type === 'caption') {
            setTheirLiveText(data.text || '')
            setTheirLiveTranslation(data.translation || '')

            if (theirCaptionTimeoutRef.current) clearTimeout(theirCaptionTimeoutRef.current)
            theirCaptionTimeoutRef.current = setTimeout(() => {
              if (mountedRef.current) {
                setTheirLiveText('')
                setTheirLiveTranslation('')
              }
            }, 4000)
          }

          if (data?.type === 'caption-final') {
            addToTranscript('partner', partnerName || 'Partner', data.text, data.translation, targetLang)
          }
        })

        // Join the call
        await call.join({
          url: dailyRoomUrl,
          userName: userName,
        })

      } catch (err: any) {
        console.error('Init error:', err)
        if (mountedRef.current) {
          setError(err.message || 'Failed to connect')
          setStatus('error')
        }
      }
    }

    const updateLocalVideo = () => {
      if (!callRef.current || !localVideoRef.current) return
      const participants = callRef.current.participants()
      const local = participants.local
      if (local?.tracks?.video?.persistentTrack) {
        const stream = new MediaStream([local.tracks.video.persistentTrack])
        localVideoRef.current.srcObject = stream
        localVideoRef.current.play().catch(() => {})
      }
    }

    const updateRemoteVideo = () => {
      if (!callRef.current || !remoteVideoRef.current) return
      const participants = callRef.current.participants()
      const remote = Object.values(participants).find(p => !p.local)
      if (remote?.tracks?.video?.persistentTrack) {
        const stream = new MediaStream([remote.tracks.video.persistentTrack])
        if (remote.tracks.audio?.persistentTrack) {
          stream.addTrack(remote.tracks.audio.persistentTrack)
        }
        remoteVideoRef.current.srcObject = stream
        remoteVideoRef.current.play().catch(() => {})
      }
    }

    const updateParticipants = () => {
      if (!callRef.current) return
      const participants = callRef.current.participants()
      const count = Object.keys(participants).length
      setParticipantCount(count)
    }

    init()

    return () => {
      mountedRef.current = false
      isListeningRef.current = false
      stopListening()
      if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current)
      if (theirCaptionTimeoutRef.current) clearTimeout(theirCaptionTimeoutRef.current)
      call?.leave()
      call?.destroy()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomCode, isHost, userName])

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSCRIPT & TRANSLATION
  // ═══════════════════════════════════════════════════════════════════════════

  const addToTranscript = useCallback((speaker: 'me' | 'partner', name: string, original: string, translated: string, lang: 'en' | 'es') => {
    if (!original.trim()) return
    const entry: TranscriptEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      speaker, name,
      original: original.trim(),
      translated: translated.trim(),
      timestamp: new Date(),
      lang
    }
    setTranscript(prev => [...prev, entry])
  }, [])

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
    recognition.maxAlternatives = 1 // Faster processing
    recognition.lang = userLang === 'en' ? 'en-US' : 'es-ES'

    let finalizedText = ''
    let debounceTimer: NodeJS.Timeout | null = null
    let lastTranslatedText = ''

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

      const displayText = finalizedText + newFinal + interim
      setMyLiveText(displayText)

      // ULTRA-FAST: Translate immediately with 80ms debounce
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(async () => {
        const textToTranslate = displayText.trim()
        // Only translate if text changed
        if (textToTranslate && textToTranslate !== lastTranslatedText && mountedRef.current) {
          lastTranslatedText = textToTranslate
          const translation = await translate(textToTranslate)
          if (mountedRef.current) {
            setMyLiveTranslation(translation)
            // Send to partner via Daily
            callRef.current?.sendAppMessage({ type: 'caption', text: textToTranslate, translation }, '*')
          }
        }
      }, 80) // Reduced from 150ms to 80ms for faster updates

      if (newFinal.trim()) {
        finalizedText += newFinal
        const translation = await translate(finalizedText.trim())
        callRef.current?.sendAppMessage({ type: 'caption-final', text: finalizedText.trim(), translation }, '*')
        addToTranscript('me', userName, finalizedText.trim(), translation, userLang)

        // Reset after 2 seconds (reduced from 3s)
        if (captionTimeoutRef.current) clearTimeout(captionTimeoutRef.current)
        captionTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current) {
            finalizedText = ''
            lastTranslatedText = ''
            setMyLiveText('')
            setMyLiveTranslation('')
          }
        }, 2000)
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
    if (!callRef.current) return
    callRef.current.setLocalAudio(!isMuted ? false : true)
    setIsMuted(!isMuted)
  }

  const toggleVideo = () => {
    if (!callRef.current) return
    callRef.current.setLocalVideo(!isVideoOff ? false : true)
    setIsVideoOff(!isVideoOff)
  }

  const endCall = () => {
    stopListening()
    callRef.current?.leave()
    callRef.current?.destroy()
    router.push('/')
  }

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/?join=call&id=${roomCode}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const isConnected = status === 'connected'
  const hasPartner = participantCount > 1
  const statusColor = isConnected && hasPartner ? 'bg-green-500' :
    status === 'error' ? 'bg-red-500' : 'bg-yellow-500 animate-pulse'

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════

  return (
    <div className="h-screen bg-black flex flex-col overflow-hidden relative">
      {/* Full screen video container */}
      <div className="flex-1 relative">
        {/* Remote video */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Gradient overlays */}
        <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none" />
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />

        {/* Waiting/Error state */}
        {(!hasPartner || status !== 'connected') && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0a0a0f]">
            <div className="text-center px-4">
              {status === 'error' ? (
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
                  <p className="text-white text-xl mb-2">{statusMessage}</p>
                  {isHost && status === 'connected' && !hasPartner && (
                    <div className="mt-4 p-4 bg-white/10 backdrop-blur">
                      <p className="text-gray-400 text-sm mb-2">Share this code:</p>
                      <p className="text-cyan-400 text-3xl font-mono font-bold tracking-wider">{roomCode}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Local video PIP */}
        <div className="absolute top-4 right-4 w-32 h-44 md:w-40 md:h-56 bg-black/50 overflow-hidden shadow-2xl border border-white/20">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover scale-x-[-1]"
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

        {/* Header */}
        <div className="absolute top-4 left-4 right-40 flex items-center gap-3">
          <div className="flex items-center gap-2 bg-black/50 backdrop-blur px-3 py-2">
            <div className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
            <span className="text-white text-sm font-medium">VoxLink</span>
            <span className="text-gray-400 text-xs font-mono">#{roomCode}</span>
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
        </div>

        {/* Captions */}
        <div className="absolute bottom-24 inset-x-0 px-4 space-y-3 pointer-events-none">
          {theirLiveText && (
            <div className="flex justify-start animate-fade-in">
              <div className="max-w-[85%] md:max-w-[70%]">
                <div className="bg-purple-500/20 backdrop-blur-xl border border-purple-500/30 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-purple-400 text-xs font-medium">{partnerName || 'Partner'}</span>
                    <span className="text-purple-400/50 text-xs">{targetLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
                  </div>
                  <p className={`text-white ${fontSizeClasses[fontSize]} leading-relaxed`}>{theirLiveText}</p>
                  {theirLiveTranslation && (
                    <p className={`text-cyan-300 ${fontSizeClasses[fontSize]} mt-2 leading-relaxed`}>→ {theirLiveTranslation}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {myLiveText && (
            <div className="flex justify-end animate-fade-in">
              <div className="max-w-[85%] md:max-w-[70%]">
                <div className="bg-cyan-500/20 backdrop-blur-xl border border-cyan-500/30 px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-cyan-400 text-xs font-medium">You</span>
                    <span className="text-cyan-400/50 text-xs">{userLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
                  </div>
                  <p className={`text-white ${fontSizeClasses[fontSize]} leading-relaxed`}>
                    {myLiveText}<span className="inline-block w-0.5 h-4 bg-white ml-1 animate-blink" />
                  </p>
                  {myLiveTranslation && (
                    <p className={`text-cyan-300 ${fontSizeClasses[fontSize]} mt-2 leading-relaxed`}>→ {myLiveTranslation}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* History Panel */}
        {showHistory && (
          <div className="absolute top-16 left-4 bottom-28 w-80 md:w-96 bg-black/90 backdrop-blur-xl border border-white/10 flex flex-col z-10">
            <div className="p-3 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-white font-medium">Conversation History</h3>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-white">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {transcript.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">Start speaking to see history</p>
              ) : (
                transcript.map(entry => (
                  <div key={entry.id} className={`p-3 ${entry.speaker === 'me' ? 'bg-cyan-500/10 border-l-2 border-cyan-500' : 'bg-purple-500/10 border-l-2 border-purple-500'}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-medium ${entry.speaker === 'me' ? 'text-cyan-400' : 'text-purple-400'}`}>{entry.name}</span>
                      <span className="text-gray-500 text-xs">{entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-white text-sm">{entry.original}</p>
                    <p className="text-gray-400 text-sm mt-1">→ {entry.translated}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="bg-black/80 backdrop-blur-xl border-t border-white/10 px-4 py-4 safe-area-bottom">
        <div className="flex items-center justify-center gap-4">
          <button onClick={toggleMute} className={`w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all ${isMuted ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}>
            {isMuted ? '🔇' : '🎤'}
          </button>

          <button onClick={toggleVideo} className={`w-14 h-14 rounded-full flex items-center justify-center text-xl transition-all ${isVideoOff ? 'bg-red-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'}`}>
            {isVideoOff ? '📵' : '📹'}
          </button>

          <button
            onClick={isListening ? stopListening : startListening}
            disabled={!isConnected}
            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all ${
              !isConnected ? 'bg-gray-700 text-gray-500' :
              isListening ? 'bg-gradient-to-br from-green-400 to-emerald-600 text-white shadow-lg shadow-green-500/50' :
              'bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg shadow-cyan-500/50'
            }`}
          >
            {isListening ? (
              <div className="flex items-center gap-1">
                {[0,1,2,3,4].map(i => (
                  <div key={i} className="w-1 bg-white rounded-full animate-soundwave" style={{ height: `${14 + Math.sin(i * 0.8) * 10}px`, animationDelay: `${i * 0.1}s` }} />
                ))}
              </div>
            ) : (
              <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V19h4v2H8v-2h4v-3.07z"/>
              </svg>
            )}
          </button>

          <button onClick={endCall} className="w-14 h-14 rounded-full bg-red-500 text-white flex items-center justify-center text-xl hover:bg-red-600 transition-all">
            📞
          </button>
        </div>

        <p className="text-center text-sm mt-3 text-gray-400">
          {!isConnected ? statusMessage :
           isListening ? <span className="text-green-400 flex items-center justify-center gap-2"><span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />Live Translating</span> :
           'Tap the mic to start translating'}
        </p>
      </div>

      <style jsx>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        @keyframes blink { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
        .animate-blink { animation: blink 1s infinite; }
        @keyframes soundwave { 0%, 100% { transform: scaleY(0.5); } 50% { transform: scaleY(1); } }
        .animate-soundwave { animation: soundwave 0.5s ease-in-out infinite; }
        .safe-area-bottom { padding-bottom: max(1rem, env(safe-area-inset-bottom)); }
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
