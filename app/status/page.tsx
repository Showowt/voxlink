'use client'

import { useEffect, useState } from 'react'

interface ServiceStatus {
  status: 'ok' | 'error' | 'degraded'
  latency?: number
  error?: string
}

interface HealthData {
  status: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  responseTime: string
  version: string
  uptime: number
  summary: {
    ok: number
    total: number
    translationAvailable: boolean
    videoCallAvailable: boolean
  }
  services: Record<string, ServiceStatus>
}

export default function StatusPage() {
  const [health, setHealth] = useState<HealthData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health')
      if (!res.ok) throw new Error('Health check failed')
      const data = await res.json()
      setHealth(data)
      setError(null)
      setLastChecked(new Date())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch status')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
    // Refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000)
    return () => clearInterval(interval)
  }, [])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'ok':
        return 'bg-green-500'
      case 'degraded':
        return 'bg-yellow-500'
      default:
        return 'bg-red-500'
    }
  }

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'ok':
        return 'bg-green-500/10 border-green-500/20'
      case 'degraded':
        return 'bg-yellow-500/10 border-yellow-500/20'
      default:
        return 'bg-red-500/10 border-red-500/20'
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'All Systems Operational'
      case 'degraded':
        return 'Partial System Outage'
      default:
        return 'Major System Outage'
    }
  }

  const formatUptime = (seconds: number) => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    if (days > 0) return `${days}d ${hours}h ${mins}m`
    if (hours > 0) return `${hours}h ${mins}m`
    return `${mins}m`
  }

  const serviceLabels: Record<string, { name: string; description: string }> = {
    mymemory: { name: 'MyMemory', description: 'Primary translation API' },
    libretranslate: { name: 'LibreTranslate', description: 'Backup translation API' },
    lingva: { name: 'Lingva', description: 'Google Translate proxy' },
    google: { name: 'Google Translate', description: 'Fallback translation' },
    peerjs: { name: 'PeerJS', description: 'Video call signaling' },
    stun: { name: 'STUN/TURN', description: 'WebRTC connectivity' },
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center font-bold text-lg">
                V
              </div>
              <div>
                <h1 className="text-xl font-bold">VoxLink Status</h1>
                <p className="text-sm text-zinc-400">Real-time system status</p>
              </div>
            </div>
            {health && (
              <div className="text-right text-sm text-zinc-400">
                <div>v{health.version}</div>
                <div>Uptime: {formatUptime(health.uptime)}</div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-500/10 border border-red-500/20 p-6 text-center">
            <div className="text-red-400 text-lg font-medium">Unable to fetch status</div>
            <div className="text-zinc-400 mt-2">{error}</div>
            <button
              onClick={fetchHealth}
              className="mt-4 px-4 py-2 bg-red-500 hover:bg-red-600 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : health ? (
          <>
            {/* Main Status Banner */}
            <div className={`p-6 border ${getStatusBg(health.status)} mb-8`}>
              <div className="flex items-center gap-4">
                <div className={`w-4 h-4 ${getStatusColor(health.status)} rounded-full animate-pulse`} />
                <div>
                  <div className="text-2xl font-bold">{getStatusText(health.status)}</div>
                  <div className="text-zinc-400 text-sm mt-1">
                    {health.summary.ok}/{health.summary.total} services operational
                  </div>
                </div>
              </div>
            </div>

            {/* Key Features Status */}
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className={`p-4 border ${health.summary.translationAvailable ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🌐</span>
                  <div>
                    <div className="font-medium">Translation</div>
                    <div className={`text-sm ${health.summary.translationAvailable ? 'text-green-400' : 'text-red-400'}`}>
                      {health.summary.translationAvailable ? 'Operational' : 'Down'}
                    </div>
                  </div>
                </div>
              </div>
              <div className={`p-4 border ${health.summary.videoCallAvailable ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                <div className="flex items-center gap-2">
                  <span className="text-2xl">📹</span>
                  <div>
                    <div className="font-medium">Video Calls</div>
                    <div className={`text-sm ${health.summary.videoCallAvailable ? 'text-green-400' : 'text-red-400'}`}>
                      {health.summary.videoCallAvailable ? 'Operational' : 'Down'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Services List */}
            <div className="border border-zinc-800">
              <div className="px-4 py-3 border-b border-zinc-800 bg-zinc-900/50">
                <h2 className="font-medium">Services</h2>
              </div>
              <div className="divide-y divide-zinc-800">
                {Object.entries(health.services).map(([key, service]) => {
                  const label = serviceLabels[key] || { name: key, description: '' }
                  return (
                    <div key={key} className="px-4 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 ${getStatusColor(service.status)} rounded-full`} />
                        <div>
                          <div className="font-medium">{label.name}</div>
                          <div className="text-sm text-zinc-500">{label.description}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        {service.status === 'ok' ? (
                          <div className="text-green-400 text-sm">{service.latency}ms</div>
                        ) : (
                          <div className="text-red-400 text-sm">{service.error || 'Error'}</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Last Updated */}
            <div className="mt-6 text-center text-sm text-zinc-500">
              Last checked: {lastChecked?.toLocaleTimeString()} • Auto-refreshes every 30s
              <br />
              Response time: {health.responseTime}
            </div>
          </>
        ) : null}
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-800 mt-12">
        <div className="max-w-4xl mx-auto px-4 py-6 text-center text-sm text-zinc-500">
          <a href="/" className="text-blue-400 hover:underline">← Back to VoxLink</a>
          <span className="mx-3">•</span>
          <a href="/api/health" className="text-zinc-400 hover:text-white">API</a>
        </div>
      </footer>
    </div>
  )
}
