'use client'

import React, { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: ErrorInfo) => void
}

interface State {
  hasError: boolean
  error: Error | null
  errorInfo: ErrorInfo | null
  retryCount: number
}

class ErrorBoundary extends Component<Props, State> {
  private maxRetries = 3

  constructor(props: Props) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0
    }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo })
    this.props.onError?.(error, errorInfo)

    // Log error for debugging
    console.error('🔴 ErrorBoundary caught:', error)
    console.error('Component stack:', errorInfo.componentStack)

    // Store error for persistence
    try {
      const errors = JSON.parse(localStorage.getItem('vox_boundary_errors') || '[]')
      errors.push({
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: Date.now()
      })
      localStorage.setItem('vox_boundary_errors', JSON.stringify(errors.slice(-10)))
    } catch {
      // Ignore storage errors
    }
  }

  handleRetry = () => {
    if (this.state.retryCount < this.maxRetries) {
      this.setState(prev => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prev.retryCount + 1
      }))
    }
  }

  handleReset = () => {
    // Clear all voxlink data and reload
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith('vox'))
      keys.forEach(k => localStorage.removeItem(k))
    } catch {}
    window.location.reload()
  }

  handleGoHome = () => {
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const canRetry = this.state.retryCount < this.maxRetries

      return (
        <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-[#12121a] rounded-2xl p-6 border border-gray-800 text-center">
            {/* Icon */}
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🔧</span>
            </div>

            {/* Title */}
            <h2 className="text-xl font-semibold text-white mb-2">
              Something went wrong
            </h2>

            {/* Message */}
            <p className="text-gray-400 text-sm mb-6">
              Don't worry, we're on it. The app encountered an issue but we can fix it.
            </p>

            {/* Error details (collapsible) */}
            <details className="text-left mb-6 bg-gray-900/50 rounded-lg p-3">
              <summary className="text-gray-500 text-xs cursor-pointer hover:text-gray-400">
                Technical details
              </summary>
              <pre className="text-red-400 text-xs mt-2 overflow-auto max-h-32">
                {this.state.error?.message}
              </pre>
            </details>

            {/* Actions */}
            <div className="space-y-3">
              {canRetry && (
                <button
                  onClick={this.handleRetry}
                  className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 text-white rounded-xl font-medium hover:opacity-90 transition"
                >
                  Try Again ({this.maxRetries - this.state.retryCount} attempts left)
                </button>
              )}

              <button
                onClick={this.handleReset}
                className="w-full py-3 bg-yellow-500/20 text-yellow-400 rounded-xl font-medium hover:bg-yellow-500/30 transition"
              >
                Reset & Refresh
              </button>

              <button
                onClick={this.handleGoHome}
                className="w-full py-3 bg-gray-700/50 text-gray-300 rounded-xl font-medium hover:bg-gray-700 transition"
              >
                Go Home
              </button>
            </div>

            {/* Recovery status */}
            {this.state.retryCount > 0 && (
              <p className="text-gray-500 text-xs mt-4">
                Recovery attempt {this.state.retryCount} of {this.maxRetries}
              </p>
            )}
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOOK FOR FUNCTIONAL COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

export function useErrorHandler() {
  return {
    captureError: (error: Error, context?: Record<string, any>) => {
      console.error('🔴 Captured error:', error, context)
      try {
        const errors = JSON.parse(localStorage.getItem('vox_captured_errors') || '[]')
        errors.push({
          message: error.message,
          context,
          timestamp: Date.now()
        })
        localStorage.setItem('vox_captured_errors', JSON.stringify(errors.slice(-20)))
      } catch {}
    }
  }
}

export default ErrorBoundary
