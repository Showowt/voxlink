'use client'

import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

// ═══════════════════════════════════════════════════════════════════════════════
// VOXTYPE COMPONENT - Type & Verify Translation (Back-Translation)
// Solves: Google Translate meaning drift, copy-paste friction
// ═══════════════════════════════════════════════════════════════════════════════

function VoxTypeTab() {
  // Language state
  const [sourceLang, setSourceLang] = useState<'en' | 'es'>('en')
  const [targetLang, setTargetLang] = useState<'en' | 'es'>('es')

  // Text state
  const [inputText, setInputText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [backTranslation, setBackTranslation] = useState('')

  // UI state
  const [isTranslating, setIsTranslating] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [shared, setShared] = useState(false)
  const [meaningMatch, setMeaningMatch] = useState<'match' | 'warning' | null>(null)
  const [canShare, setCanShare] = useState(false)

  // Check if Web Share API is available
  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && !!navigator.share)
  }, [])

  // Debounce timer
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  // Auto-sync languages
  useEffect(() => {
    if (sourceLang === targetLang) {
      setTargetLang(sourceLang === 'en' ? 'es' : 'en')
    }
  }, [sourceLang, targetLang])

  // Swap languages
  const swapLanguages = useCallback(() => {
    const newSource = targetLang
    const newTarget = sourceLang
    setSourceLang(newSource)
    setTargetLang(newTarget)
    setInputText('')
    setTranslatedText('')
    setBackTranslation('')
    setMeaningMatch(null)
  }, [sourceLang, targetLang])

  // Translate with back-translation
  const translateWithVerification = useCallback(async (text: string) => {
    if (!text.trim()) {
      setTranslatedText('')
      setBackTranslation('')
      setMeaningMatch(null)
      return
    }

    setIsTranslating(true)
    setError('')

    try {
      // Step 1: Translate to target language
      const response1 = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          sourceLang,
          targetLang
        })
      })

      if (!response1.ok) throw new Error('Translation failed')
      const data1 = await response1.json()

      if (!data1.translation) {
        setError(data1.error || 'Translation failed')
        return
      }

      setTranslatedText(data1.translation)

      // Step 2: Back-translate to verify meaning
      const response2 = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: data1.translation,
          sourceLang: targetLang,
          targetLang: sourceLang
        })
      })

      if (!response2.ok) throw new Error('Back-translation failed')
      const data2 = await response2.json()

      if (data2.translation) {
        setBackTranslation(data2.translation)

        // Simple meaning comparison (normalize and compare)
        const normalize = (s: string) => s.toLowerCase().replace(/[^\w\s]/g, '').trim()
        const original = normalize(text)
        const back = normalize(data2.translation)

        // Check similarity
        const words1 = original.split(/\s+/)
        const words2 = back.split(/\s+/)
        const commonWords = words1.filter(w => words2.includes(w))
        const similarity = commonWords.length / Math.max(words1.length, words2.length)

        setMeaningMatch(similarity > 0.5 ? 'match' : 'warning')
      }
    } catch (err) {
      console.error('Translation error:', err)
      setError('Translation failed. Check your connection.')
    } finally {
      setIsTranslating(false)
    }
  }, [sourceLang, targetLang])

  // Debounced translation on input change
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    if (inputText.trim()) {
      debounceRef.current = setTimeout(() => {
        translateWithVerification(inputText)
      }, 500)
    } else {
      setTranslatedText('')
      setBackTranslation('')
      setMeaningMatch(null)
    }

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [inputText, translateWithVerification])

  // Copy translation
  const copyTranslation = async () => {
    if (!translatedText) return

    try {
      await navigator.clipboard.writeText(translatedText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = translatedText
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Share translation (Web Share API)
  const shareTranslation = async () => {
    if (!translatedText) return

    try {
      await navigator.share({
        text: translatedText
      })
      setShared(true)
      setTimeout(() => setShared(false), 2000)
    } catch (err: any) {
      // User cancelled or share failed - fallback to copy
      if (err.name !== 'AbortError') {
        copyTranslation()
      }
    }
  }

  // Clear all
  const clearAll = () => {
    setInputText('')
    setTranslatedText('')
    setBackTranslation('')
    setError('')
    setMeaningMatch(null)
  }

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header - Hidden on small mobile to save space */}
      <div className="text-center pb-1 sm:pb-2 hidden sm:block">
        <p className="text-gray-400 text-xs sm:text-sm">
          Type → Translate → <span className="text-cyan-400">Verify meaning</span> → Share
        </p>
      </div>

      {/* Language Selector - Compact */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          onClick={() => setSourceLang(sourceLang === 'en' ? 'es' : 'en')}
          className="flex-1 p-2 sm:p-3 rounded-lg sm:rounded-xl bg-[#1a1a2e] border border-gray-700 text-white flex items-center justify-center gap-1.5 sm:gap-2 transition hover:border-gray-600"
        >
          <span className="text-lg sm:text-xl">{sourceLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
          <span className="font-medium text-sm sm:text-base">{sourceLang === 'en' ? 'EN' : 'ES'}</span>
        </button>

        <button
          onClick={swapLanguages}
          className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-[#1a1a2e] border border-gray-700 text-cyan-400 transition hover:bg-cyan-500/10 hover:border-cyan-500/50"
        >
          ⇄
        </button>

        <button
          onClick={() => setTargetLang(targetLang === 'en' ? 'es' : 'en')}
          className="flex-1 p-2 sm:p-3 rounded-lg sm:rounded-xl bg-[#1a1a2e] border border-gray-700 text-white flex items-center justify-center gap-1.5 sm:gap-2 transition hover:border-gray-600"
        >
          <span className="text-lg sm:text-xl">{targetLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
          <span className="font-medium text-sm sm:text-base">{targetLang === 'en' ? 'EN' : 'ES'}</span>
        </button>
      </div>

      {/* Input Field - Compact */}
      <div className="space-y-1.5 sm:space-y-2">
        <label className="text-xs sm:text-sm text-gray-400 flex items-center gap-1.5 sm:gap-2">
          <span>{sourceLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
          Type your message
        </label>
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder={sourceLang === 'en' ? 'Type what you want to say...' : 'Escribe lo que quieres decir...'}
          rows={2}
          className="w-full px-3 py-2.5 sm:px-4 sm:py-3 bg-[#1a1a2e] border border-gray-700 rounded-lg sm:rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition resize-none text-base sm:text-lg"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="p-2 sm:p-3 rounded-lg sm:rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs sm:text-sm text-center">
          {error}
        </div>
      )}

      {/* Loading */}
      {isTranslating && (
        <div className="flex items-center justify-center gap-2 py-3 sm:py-4">
          <div className="w-4 h-4 sm:w-5 sm:h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400 text-xs sm:text-sm">Translating...</span>
        </div>
      )}

      {/* Translation Result */}
      {translatedText && !isTranslating && (
        <div className="space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs sm:text-sm text-gray-400 flex items-center gap-1.5 sm:gap-2">
              <span>{targetLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
              Translation
            </label>
          </div>
          <div className="p-3 sm:p-4 rounded-lg sm:rounded-xl bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/30 text-cyan-100 text-sm sm:text-base">
            {translatedText}
          </div>

          {/* Share/Copy Buttons - Compact */}
          <div className="flex gap-2">
            {canShare ? (
              <>
                {/* Share Button - Primary on mobile */}
                <button
                  onClick={shareTranslation}
                  className={`flex-1 py-3 sm:py-4 rounded-lg sm:rounded-xl font-semibold text-base sm:text-lg transition shadow-lg ${
                    shared
                      ? 'bg-green-500 text-white shadow-green-500/25'
                      : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-green-500/25'
                  }`}
                >
                  {shared ? '✓ Shared!' : '📤 Share'}
                </button>
                {/* Copy Button - Secondary */}
                <button
                  onClick={copyTranslation}
                  className={`py-3 sm:py-4 px-4 sm:px-5 rounded-lg sm:rounded-xl font-semibold text-base sm:text-lg transition ${
                    copied
                      ? 'bg-green-500 text-white'
                      : 'bg-[#1a1a2e] border border-gray-700 text-gray-300 hover:text-white hover:border-gray-600'
                  }`}
                >
                  {copied ? '✓' : '📋'}
                </button>
              </>
            ) : (
              /* Copy Button - Primary on desktop */
              <button
                onClick={copyTranslation}
                className={`w-full py-3 sm:py-4 rounded-lg sm:rounded-xl font-semibold text-base sm:text-lg transition shadow-lg ${
                  copied
                    ? 'bg-green-500 text-white shadow-green-500/25'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white shadow-cyan-500/25'
                }`}
              >
                {copied ? '✓ Copied!' : '📋 Copy Translation'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Back-Translation Verification - Compact */}
      {backTranslation && !isTranslating && (
        <div className="space-y-1.5 sm:space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs sm:text-sm text-gray-400 flex items-center gap-1.5">
              <span>🔄</span>
              <span className="hidden sm:inline">Verification</span>
              <span className="sm:hidden">Verify</span>
            </label>
            {meaningMatch === 'match' && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                ✓ OK
              </span>
            )}
            {meaningMatch === 'warning' && (
              <span className="text-xs text-yellow-400 flex items-center gap-1">
                ⚠️ Check
              </span>
            )}
          </div>
          <div className={`p-2.5 sm:p-3 rounded-lg sm:rounded-xl border text-sm sm:text-base ${
            meaningMatch === 'match'
              ? 'bg-green-500/10 border-green-500/30 text-green-100'
              : meaningMatch === 'warning'
                ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-100'
                : 'bg-[#1a1a2e] border-gray-700 text-gray-300'
          }`}>
            <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5 sm:mb-1">They will understand:</p>
            <p>{backTranslation}</p>
          </div>

          {meaningMatch === 'warning' && (
            <p className="text-[10px] sm:text-xs text-yellow-400 text-center">
              💡 Rephrase with simpler words
            </p>
          )}
        </div>
      )}

      {/* Clear Button - Compact */}
      {inputText && (
        <button
          onClick={clearAll}
          className="w-full py-2.5 sm:py-3 rounded-lg sm:rounded-xl bg-[#1a1a2e] border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 transition text-sm sm:text-base"
        >
          🗑️ Clear
        </button>
      )}

      {/* WhatsApp Workflow - Hidden on mobile when there's content, always shown when empty */}
      {!translatedText && (
        <div className="p-3 sm:p-4 rounded-lg sm:rounded-xl bg-green-500/10 border border-green-500/30">
          <p className="text-green-400 text-xs sm:text-sm font-medium flex items-center gap-2">
            <span className="text-base sm:text-lg">💬</span> How it works
          </p>
          <ol className="text-gray-400 text-[10px] sm:text-xs mt-1.5 sm:mt-2 space-y-0.5 sm:space-y-1 list-decimal list-inside">
            <li>Type your message</li>
            <li>Check verification matches your intent</li>
            <li>Tap Share or Copy</li>
          </ol>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// VOXNOTE COMPONENT - WhatsApp Voice Message Translator
// Fixed: Stale closure bug, cleanup on unmount, same language prevention
// ═══════════════════════════════════════════════════════════════════════════════

function VoxNoteTab() {
  // Language state - default: Spanish → English (most common for WhatsApp voice msgs)
  const [sourceLang, setSourceLang] = useState<'en' | 'es'>('es')
  const [targetLang, setTargetLang] = useState<'en' | 'es'>('en')
  
  // Recording state
  const [isRecording, setIsRecording] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [recordingTime, setRecordingTime] = useState(0)
  
  // Text state
  const [originalText, setOriginalText] = useState('')
  const [translatedText, setTranslatedText] = useState('')
  const [interimText, setInterimText] = useState('')
  
  // UI state
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<'original' | 'translated' | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [isSpeaking, setIsSpeaking] = useState(false)
  
  // Refs to avoid stale closures
  const recognitionRef = useRef<any>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const isRecordingRef = useRef(false)
  const finalTranscriptRef = useRef('')
  
  // Keep ref in sync with state
  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  // Check online status
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    setIsOnline(navigator.onLine)
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop recording state first to prevent restart
      isRecordingRef.current = false
      if (recognitionRef.current) {
        try { recognitionRef.current.stop() } catch {}
        recognitionRef.current = null
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      speechSynthesis.cancel()
    }
  }, [])

  // Auto-sync languages to prevent same source/target
  useEffect(() => {
    if (sourceLang === targetLang) {
      setTargetLang(sourceLang === 'en' ? 'es' : 'en')
    }
  }, [sourceLang, targetLang])

  // Swap languages
  const swapLanguages = useCallback(() => {
    const newSource = targetLang
    const newTarget = sourceLang
    setSourceLang(newSource)
    setTargetLang(newTarget)
    
    // Also swap the text if both exist
    if (originalText && translatedText) {
      setOriginalText(translatedText)
      setTranslatedText(originalText)
    }
  }, [sourceLang, targetLang, originalText, translatedText])

  // Translate text via API
  const translateText = useCallback(async (text: string) => {
    if (!text.trim()) return
    
    setIsProcessing(true)
    setError('')
    
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim(),
          sourceLang,
          targetLang
        })
      })
      
      if (!response.ok) {
        throw new Error('Translation failed')
      }
      
      const data = await response.json()
      if (data.translation) {
        setTranslatedText(data.translation)
      } else if (data.error) {
        setError(data.error)
      } else {
        setError('Translation failed. Please try again.')
      }
    } catch (err) {
      console.error('Translation error:', err)
      setError('Translation failed. Check your connection.')
    } finally {
      setIsProcessing(false)
    }
  }, [sourceLang, targetLang])

  // Start recording
  const startRecording = useCallback(() => {
    // Reset state
    setError('')
    setOriginalText('')
    setTranslatedText('')
    setInterimText('')
    setRecordingTime(0)
    finalTranscriptRef.current = ''
    
    // Check browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setError('Speech recognition not supported. Please use Chrome or Edge.')
      return
    }

    // Check online
    if (!navigator.onLine) {
      setError('No internet connection. Speech recognition requires internet.')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = sourceLang === 'en' ? 'en-US' : 'es-ES'
    recognition.maxAlternatives = 1

    recognition.onresult = (event: any) => {
      let interim = ''
      let final = ''
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          final += transcript + ' '
        } else {
          interim = transcript
        }
      }
      
      if (final) {
        finalTranscriptRef.current += final
        setOriginalText(finalTranscriptRef.current)
      }
      setInterimText(interim)
    }

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error)
      
      switch (event.error) {
        case 'no-speech':
          setError('No speech detected. Please try again.')
          break
        case 'audio-capture':
          setError('No microphone found. Please check your device.')
          break
        case 'not-allowed':
          setError('Microphone access denied. Please allow microphone access.')
          break
        case 'network':
          setError('Network error. Please check your connection.')
          break
        default:
          setError(`Error: ${event.error}`)
      }
      
      stopRecording()
    }

    recognition.onend = () => {
      // Use ref to check current state (fixes stale closure)
      if (isRecordingRef.current) {
        // Recognition ended but we're still recording - restart it
        try {
          recognition.start()
        } catch {}
      } else {
        // We intentionally stopped - translate what we have
        const textToTranslate = finalTranscriptRef.current.trim()
        if (textToTranslate) {
          translateText(textToTranslate)
        }
      }
    }

    // Start recognition
    try {
      recognitionRef.current = recognition
      recognition.start()
      setIsRecording(true)
      
      // Start timer
      timerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1)
      }, 1000)
    } catch (err) {
      setError('Could not start recording. Please try again.')
    }
  }, [sourceLang, translateText])

  // Stop recording
  const stopRecording = useCallback(() => {
    setIsRecording(false)
    setInterimText('')
    
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
      recognitionRef.current = null
    }
  }, [])

  // Toggle recording
  const toggleRecording = () => {
    if (isRecording) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  // Copy to clipboard
  const copyToClipboard = async (text: string, type: 'original' | 'translated') => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    }
  }

  // Speak translation
  const speakTranslation = () => {
    if (!translatedText || isSpeaking) return
    
    // Cancel any ongoing speech
    speechSynthesis.cancel()
    
    const utterance = new SpeechSynthesisUtterance(translatedText)
    utterance.lang = targetLang === 'en' ? 'en-US' : 'es-ES'
    utterance.rate = 0.9
    utterance.pitch = 1
    
    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)
    
    speechSynthesis.speak(utterance)
  }

  // Format time display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Clear all
  const clearAll = () => {
    setOriginalText('')
    setTranslatedText('')
    setInterimText('')
    setError('')
    setRecordingTime(0)
    finalTranscriptRef.current = ''
    speechSynthesis.cancel()
    setIsSpeaking(false)
  }

  // Display text (original + interim while recording)
  const displayText = originalText + (interimText ? (originalText ? ' ' : '') + interimText : '')

  // Check for browser support
  const [browserSupported, setBrowserSupported] = useState(true)
  
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setBrowserSupported(!!SpeechRecognition)
  }, [])

  return (
    <div className="space-y-4">
      {/* Browser Compatibility Warning */}
      {!browserSupported && (
        <div className="p-3 rounded-xl bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm text-center">
          ⚠️ Speech recognition requires Chrome or Edge browser. Safari and Firefox are not supported.
        </div>
      )}
      
      {/* Offline Warning */}
      {!isOnline && (
        <div className="p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm text-center">
          ⚠️ You're offline. Translation requires internet.
        </div>
      )}

      {/* Language Selector */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setSourceLang(sourceLang === 'en' ? 'es' : 'en')}
          disabled={isRecording}
          className={`flex-1 p-3 rounded-xl bg-[#1a1a2e] border border-gray-700 text-white flex items-center justify-center gap-2 transition ${
            isRecording ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'
          }`}
        >
          <span className="text-xl">{sourceLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
          <span className="font-medium">{sourceLang === 'en' ? 'English' : 'Español'}</span>
        </button>
        
        <button
          onClick={swapLanguages}
          disabled={isRecording}
          className={`p-3 rounded-xl bg-[#1a1a2e] border border-gray-700 text-green-400 transition ${
            isRecording ? 'opacity-50 cursor-not-allowed' : 'hover:bg-green-500/10 hover:border-green-500/50'
          }`}
        >
          ⇄
        </button>
        
        <button
          onClick={() => setTargetLang(targetLang === 'en' ? 'es' : 'en')}
          disabled={isRecording}
          className={`flex-1 p-3 rounded-xl bg-[#1a1a2e] border border-gray-700 text-white flex items-center justify-center gap-2 transition ${
            isRecording ? 'opacity-50 cursor-not-allowed' : 'hover:border-gray-600'
          }`}
        >
          <span className="text-xl">{targetLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
          <span className="font-medium">{targetLang === 'en' ? 'English' : 'Español'}</span>
        </button>
      </div>

      {/* Recording Button */}
      <div className="flex flex-col items-center py-6">
        <button
          onClick={toggleRecording}
          disabled={isProcessing || !isOnline || !browserSupported}
          className={`w-28 h-28 rounded-full flex items-center justify-center transition-all shadow-lg ${
            isProcessing || !browserSupported
              ? 'bg-gray-600 cursor-not-allowed'
              : isRecording
                ? 'bg-red-500 hover:bg-red-600 shadow-red-500/50'
                : 'bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-green-500/30 hover:shadow-green-500/50'
          }`}
          style={isRecording ? { animation: 'pulse 1.5s ease-in-out infinite' } : {}}
        >
          {isProcessing ? (
            <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
          ) : isRecording ? (
            <div className="w-10 h-10 bg-white rounded-md" />
          ) : (
            <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V19h4v2H8v-2h4v-3.07z"/>
            </svg>
          )}
        </button>
        
        {/* Recording indicator */}
        {isRecording && (
          <div className="mt-4 flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
            </span>
            <span className="text-red-400 font-mono text-lg">{formatTime(recordingTime)}</span>
          </div>
        )}
        
        <p className="text-gray-500 text-sm mt-3">
          {!browserSupported
            ? 'Use Chrome or Edge browser'
            : isProcessing 
              ? 'Translating...' 
              : isRecording 
                ? 'Tap to stop recording' 
                : 'Tap to record voice message'
          }
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      {/* Original Text */}
      {displayText && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400 flex items-center gap-2">
              <span>{sourceLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
              Original ({sourceLang === 'en' ? 'English' : 'Español'})
              {isRecording && <span className="text-green-400 text-xs">(listening...)</span>}
            </span>
            {originalText && !isRecording && (
              <button
                onClick={() => copyToClipboard(originalText, 'original')}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition"
              >
                {copied === 'original' ? '✓ Copied!' : '📋 Copy'}
              </button>
            )}
          </div>
          <div className={`p-4 rounded-xl bg-[#1a1a2e] border text-white min-h-[60px] ${
            isRecording ? 'border-green-500/50' : 'border-gray-700'
          }`}>
            {displayText}
            {isRecording && <span className="animate-pulse">|</span>}
          </div>
        </div>
      )}

      {/* Translated Text */}
      {translatedText && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400 flex items-center gap-2">
              <span>{targetLang === 'en' ? '🇺🇸' : '🇪🇸'}</span>
              Translation ({targetLang === 'en' ? 'English' : 'Español'})
            </span>
            <div className="flex gap-3">
              <button
                onClick={speakTranslation}
                disabled={isSpeaking}
                className={`text-xs transition ${
                  isSpeaking ? 'text-green-400' : 'text-cyan-400 hover:text-cyan-300'
                }`}
              >
                {isSpeaking ? '🔊 Playing...' : '🔊 Listen'}
              </button>
              <button
                onClick={() => copyToClipboard(translatedText, 'translated')}
                className="text-xs text-cyan-400 hover:text-cyan-300 transition"
              >
                {copied === 'translated' ? '✓ Copied!' : '📋 Copy'}
              </button>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-gradient-to-br from-green-500/10 to-emerald-500/10 border border-green-500/30 text-green-100 min-h-[60px]">
            {translatedText}
          </div>
        </div>
      )}

      {/* Clear Button */}
      {(originalText || translatedText) && !isRecording && (
        <button
          onClick={clearAll}
          className="w-full py-3 rounded-xl bg-[#1a1a2e] border border-gray-700 text-gray-400 hover:text-white hover:border-gray-600 transition"
        >
          🗑️ Clear & Start New
        </button>
      )}

      {/* WhatsApp Tip */}
      <div className="p-4 rounded-xl bg-green-500/10 border border-green-500/30">
        <p className="text-green-400 text-sm font-medium flex items-center gap-2">
          <span className="text-lg">💡</span> WhatsApp Voice Message Tip
        </p>
        <p className="text-gray-400 text-xs mt-2 leading-relaxed">
          Play the WhatsApp voice message out loud on speaker, then tap the record button here to translate it instantly!
        </p>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN HOME CONTENT
// ═══════════════════════════════════════════════════════════════════════════════

function HomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  
  // Check for join links
  const joinType = searchParams.get('join')
  const joinId = searchParams.get('id')
  
  // Form state
  const [name, setName] = useState('')
  const [language, setLanguage] = useState<'en' | 'es'>('en')
  const [joinCode, setJoinCode] = useState('')
  const [activeTab, setActiveTab] = useState<'video' | 'talk' | 'voxnote' | 'voxtype'>('voxtype')
  const [mode, setMode] = useState<'start' | 'join'>('start')
  const [isJoining, setIsJoining] = useState(false)

  // Load saved preferences
  useEffect(() => {
    const savedName = localStorage.getItem('voxlink_name')
    const savedLang = localStorage.getItem('voxlink_lang') as 'en' | 'es'
    if (savedName) setName(savedName)
    if (savedLang) setLanguage(savedLang)
    
    // Handle join links
    if (joinType && joinId) {
      setIsJoining(true)
      setJoinCode(joinId.toUpperCase())
      setActiveTab(joinType === 'talk' ? 'talk' : 'video')
      setMode('join')
    }
  }, [joinType, joinId])

  // Save preferences
  useEffect(() => {
    if (name) localStorage.setItem('voxlink_name', name)
    if (language) localStorage.setItem('voxlink_lang', language)
  }, [name, language])

  // Generate room code
  const generateCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase()
  }

  // Start Video Call
  const startVideoCall = () => {
    if (!name.trim()) {
      alert('Please enter your name')
      return
    }
    const code = generateCode()
    router.push(`/call/${code}?host=true&name=${encodeURIComponent(name)}&lang=${language}`)
  }

  // Join Video Call
  const joinVideoCall = () => {
    if (!name.trim()) {
      alert('Please enter your name')
      return
    }
    if (!joinCode.trim() || joinCode.length < 4) {
      alert('Please enter a valid code')
      return
    }
    router.push(`/call/${joinCode.toUpperCase()}?host=false&name=${encodeURIComponent(name)}&lang=${language}`)
  }

  // Start Talk Mode
  const startTalkMode = () => {
    if (!name.trim()) {
      alert('Please enter your name')
      return
    }
    const code = generateCode()
    router.push(`/talk/${code}?host=true&name=${encodeURIComponent(name)}&lang=${language}`)
  }

  // Join Talk Mode
  const joinTalkMode = () => {
    if (!name.trim()) {
      alert('Please enter your name')
      return
    }
    if (!joinCode.trim() || joinCode.length < 4) {
      alert('Please enter a valid code')
      return
    }
    router.push(`/talk/${joinCode.toUpperCase()}?host=false&name=${encodeURIComponent(name)}&lang=${language}`)
  }

  // Joining screen
  if (isJoining && joinId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-[#12121a] rounded-2xl border border-gray-800 p-6">
            <div className="text-center mb-6">
              <span className="text-4xl">{joinType === 'talk' ? '💬' : '📹'}</span>
              <h2 className="text-xl font-bold text-white mt-3">
                Join {joinType === 'talk' ? 'Conversation' : 'Video Call'}
              </h2>
              <p className="text-gray-400 text-sm mt-1">Code: <span className="font-mono text-cyan-400">{joinId}</span></p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Your Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-3 bg-[#1a1a2e] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-2">You Speak</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setLanguage('en')}
                    className={`p-3 rounded-xl border-2 transition flex items-center justify-center gap-2 ${
                      language === 'en'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border-gray-700 bg-[#1a1a2e] text-gray-400'
                    }`}
                  >
                    <span className="text-xl">🇺🇸</span>
                    <span>English</span>
                  </button>
                  <button
                    onClick={() => setLanguage('es')}
                    className={`p-3 rounded-xl border-2 transition flex items-center justify-center gap-2 ${
                      language === 'es'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                        : 'border-gray-700 bg-[#1a1a2e] text-gray-400'
                    }`}
                  >
                    <span className="text-xl">🇪🇸</span>
                    <span>Español</span>
                  </button>
                </div>
              </div>
              
              <button
                onClick={joinType === 'talk' ? joinTalkMode : joinVideoCall}
                className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 rounded-xl text-white font-semibold text-lg transition shadow-lg shadow-cyan-500/25"
              >
                {joinType === 'talk' ? '💬 Join / Unirse' : '📹 Join / Unirse'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[100dvh] bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex flex-col py-3 px-3 sm:py-4 sm:px-4 sm:justify-center overflow-y-auto">
      <div className="w-full max-w-md mx-auto flex-shrink-0">
        {/* Logo - Compact on mobile */}
        <div className="text-center mb-3 sm:mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-2 sm:mb-3 shadow-lg shadow-cyan-500/25">
            <span className="text-2xl sm:text-3xl">🔗</span>
          </div>
          <div className="flex items-center justify-center gap-1 mb-0.5 sm:mb-1">
            <span className="text-xs sm:text-sm font-medium text-cyan-400 tracking-wider">MACHINEMIND</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-0.5 sm:mb-1">VoxLink™</h1>
          <p className="text-gray-400 text-xs sm:text-sm">Break Language Barriers Instantly</p>
        </div>

        {/* Card */}
        <div className="bg-[#12121a] rounded-xl sm:rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
          {/* Mode Tabs - Compact on mobile */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setActiveTab('voxtype')}
              className={`flex-1 py-2.5 sm:py-3 text-center font-medium transition text-xs sm:text-sm ${
                activeTab === 'voxtype'
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              ⌨️ Type
            </button>
            <button
              onClick={() => setActiveTab('voxnote')}
              className={`flex-1 py-2.5 sm:py-3 text-center font-medium transition text-xs sm:text-sm ${
                activeTab === 'voxnote'
                  ? 'text-green-400 border-b-2 border-green-400 bg-green-500/5'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              🎤 Voice
            </button>
            <button
              onClick={() => setActiveTab('talk')}
              className={`flex-1 py-2.5 sm:py-3 text-center font-medium transition text-xs sm:text-sm ${
                activeTab === 'talk'
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              💬 Face
            </button>
            <button
              onClick={() => setActiveTab('video')}
              className={`flex-1 py-2.5 sm:py-3 text-center font-medium transition text-xs sm:text-sm ${
                activeTab === 'video'
                  ? 'text-cyan-400 border-b-2 border-cyan-400 bg-cyan-500/5'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              📹 Call
            </button>
          </div>

          <div className="p-3 sm:p-5 max-h-[calc(100dvh-220px)] sm:max-h-none overflow-y-auto">
            {/* VoxType Tab - Type & Verify Translation */}
            {activeTab === 'voxtype' ? (
              <VoxTypeTab />
            ) : activeTab === 'voxnote' ? (
              <VoxNoteTab />
            ) : (
              <>
                {/* Description */}
                <div className="mb-5 p-3 rounded-xl bg-gray-800/50 text-center">
                  {activeTab === 'video' ? (
                    <p className="text-gray-300 text-sm">
                      <span className="text-cyan-400 font-medium">Video Call:</span> Remote calls with live translation
                    </p>
                  ) : (
                    <p className="text-gray-300 text-sm">
                      <span className="text-cyan-400 font-medium">Face-to-Face:</span> Sit with someone, each uses their phone
                    </p>
                  )}
                </div>

                {/* Name */}
                <div className="mb-4">
                  <label className="block text-sm text-gray-400 mb-2">Your Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full px-4 py-3 bg-[#1a1a2e] border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition text-lg"
                  />
                </div>

                {/* Language */}
                <div className="mb-5">
                  <label className="block text-sm text-gray-400 mb-2">You Speak</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setLanguage('en')}
                      className={`p-3 rounded-xl border-2 transition flex items-center justify-center gap-2 ${
                        language === 'en'
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                          : 'border-gray-700 bg-[#1a1a2e] text-gray-400'
                      }`}
                    >
                      <span className="text-xl">🇺🇸</span>
                      <span className="font-medium">English</span>
                    </button>
                    <button
                      onClick={() => setLanguage('es')}
                      className={`p-3 rounded-xl border-2 transition flex items-center justify-center gap-2 ${
                        language === 'es'
                          ? 'border-cyan-500 bg-cyan-500/10 text-cyan-400'
                          : 'border-gray-700 bg-[#1a1a2e] text-gray-400'
                      }`}
                    >
                      <span className="text-xl">🇪🇸</span>
                      <span className="font-medium">Spanish</span>
                    </button>
                  </div>
                </div>

                {/* Start/Join Toggle */}
                <div className="flex gap-2 mb-4">
                  <button
                    onClick={() => setMode('start')}
                    className={`flex-1 py-2 rounded-lg font-medium transition ${
                      mode === 'start' ? 'bg-cyan-500 text-white' : 'bg-[#1a1a2e] text-gray-400'
                    }`}
                  >
                    Start New
                  </button>
                  <button
                    onClick={() => setMode('join')}
                    className={`flex-1 py-2 rounded-lg font-medium transition ${
                      mode === 'join' ? 'bg-cyan-500 text-white' : 'bg-[#1a1a2e] text-gray-400'
                    }`}
                  >
                    Join
                  </button>
                </div>

                {/* Action */}
                {mode === 'start' ? (
                  <button
                    onClick={activeTab === 'video' ? startVideoCall : startTalkMode}
                    className="w-full py-4 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 rounded-xl text-white font-semibold text-lg transition shadow-lg shadow-cyan-500/25"
                  >
                    {activeTab === 'video' ? '📹 Start Video Call' : '💬 Start Conversation'}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="Enter code"
                      maxLength={6}
                      className="w-full px-4 py-3 bg-[#1a1a2e] border border-gray-700 rounded-xl text-white text-center text-2xl tracking-[0.3em] placeholder-gray-500 focus:outline-none focus:border-cyan-500 transition uppercase font-mono"
                    />
                    <button
                      onClick={activeTab === 'video' ? joinVideoCall : joinTalkMode}
                      className="w-full py-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 rounded-xl text-white font-semibold text-lg transition shadow-lg shadow-blue-500/25"
                    >
                      {activeTab === 'video' ? '📹 Join Call' : '💬 Join Conversation'}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer - Compact on mobile */}
        <div className="text-center mt-3 sm:mt-6 space-y-1 sm:space-y-2 pb-2">
          <p className="text-gray-500 text-[10px] sm:text-xs">
            Chrome recommended • <a href="/status" className="text-cyan-500 hover:underline">Status</a>
          </p>
          <div className="pt-1 sm:pt-2 border-t border-gray-800">
            <a
              href="https://machinemindconsulting.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 sm:gap-2 text-[10px] sm:text-xs text-gray-400 hover:text-cyan-400 transition"
            >
              <span>Powered by</span>
              <span className="font-semibold text-cyan-500">MachineMind</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading VoxLink...</p>
        </div>
      </div>
    }>
      <HomeContent />
    </Suspense>
  )
}
