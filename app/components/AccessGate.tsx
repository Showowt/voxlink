'use client'

import { useState, useEffect } from 'react'

// ═══════════════════════════════════════════════════════════════════════════════
// ACCESS GATE - 4-Digit Code Protection
// Temporary security layer until full auth/subscription system is built
// ═══════════════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'voxlink_access_token'

interface AccessGateProps {
  children: React.ReactNode
}

export default function AccessGate({ children }: AccessGateProps) {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null)
  const [code, setCode] = useState(['', '', '', ''])
  const [error, setError] = useState('')
  const [isShaking, setIsShaking] = useState(false)

  // Check if already authorized (has valid token)
  useEffect(() => {
    const token = sessionStorage.getItem(STORAGE_KEY)
    // Token must be 64 chars (hex string from 32 bytes)
    setIsAuthorized(token !== null && token.length === 64)
  }, [])

  // Handle digit input
  const handleDigitChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return // Only digits

    const newCode = [...code]
    newCode[index] = value.slice(-1) // Only last digit

    setCode(newCode)
    setError('')

    // Auto-focus next input
    if (value && index < 3) {
      const nextInput = document.getElementById(`code-${index + 1}`)
      nextInput?.focus()
    }

    // Auto-submit when all digits entered
    if (index === 3 && value) {
      const fullCode = newCode.join('')
      if (fullCode.length === 4) {
        setTimeout(() => verifyCode(fullCode), 100)
      }
    }
  }

  // Handle backspace
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      const prevInput = document.getElementById(`code-${index - 1}`)
      prevInput?.focus()
    }
    if (e.key === 'Enter') {
      verifyCode(code.join(''))
    }
  }

  // Handle paste
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4)
    if (pasted.length === 4) {
      setCode(pasted.split(''))
      setTimeout(() => verifyCode(pasted), 100)
    }
  }

  // Verify code via server API
  const verifyCode = async (enteredCode: string) => {
    if (enteredCode.length !== 4) return

    try {
      const res = await fetch('/api/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: enteredCode })
      })

      const data = await res.json()

      if (data.valid && data.token) {
        sessionStorage.setItem(STORAGE_KEY, data.token)
        setIsAuthorized(true)
      } else {
        setError(data.error || 'Invalid code')
        setIsShaking(true)
        setTimeout(() => {
          setIsShaking(false)
          setCode(['', '', '', ''])
          document.getElementById('code-0')?.focus()
        }, 500)
      }
    } catch {
      setError('Connection error. Try again.')
      setIsShaking(true)
      setTimeout(() => setIsShaking(false), 500)
    }
  }

  // Loading state
  if (isAuthorized === null) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Authorized - show app
  if (isAuthorized) {
    return <>{children}</>
  }

  // Access gate
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0d1117] to-[#0a0a0f] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4 shadow-lg shadow-cyan-500/25">
            <span className="text-4xl">🔐</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">VoxLink Access</h1>
          <p className="text-gray-400 text-sm">Enter your 4-digit access code</p>
        </div>

        {/* Code Input */}
        <div className="bg-[#12121a] rounded-2xl border border-gray-800 p-6">
          <div
            className={`flex justify-center gap-3 mb-6 ${isShaking ? 'animate-shake' : ''}`}
            onPaste={handlePaste}
          >
            {code.map((digit, index) => (
              <input
                key={index}
                id={`code-${index}`}
                type="text"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handleDigitChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className={`w-14 h-16 text-center text-2xl font-bold rounded-xl border-2 bg-[#1a1a2e] text-white focus:outline-none transition-all ${
                  error
                    ? 'border-red-500'
                    : digit
                      ? 'border-cyan-500'
                      : 'border-gray-700 focus:border-cyan-500'
                }`}
                autoFocus={index === 0}
              />
            ))}
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-400 text-center text-sm mb-4">{error}</p>
          )}

          {/* Submit Button */}
          <button
            onClick={() => verifyCode(code.join(''))}
            disabled={code.some(d => !d)}
            className={`w-full py-4 rounded-xl font-semibold text-lg transition shadow-lg ${
              code.every(d => d)
                ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-cyan-500/25 hover:from-cyan-600 hover:to-blue-700'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
            }`}
          >
            Enter
          </button>
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-gray-600 text-xs">
            Contact administrator for access code
          </p>
          <div className="mt-3 pt-3 border-t border-gray-800">
            <span className="text-xs text-gray-500">Powered by </span>
            <span className="text-xs text-cyan-500 font-semibold">MachineMind</span>
          </div>
        </div>
      </div>

      {/* Shake animation */}
      <style jsx>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-5px); }
          20%, 40%, 60%, 80% { transform: translateX(5px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  )
}
