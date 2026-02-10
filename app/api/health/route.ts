import { NextResponse } from 'next/server'

// Force dynamic rendering - never statically generate
export const dynamic = 'force-dynamic'

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK ENDPOINT - Monitors all external services for 24/7 reliability
// ═══════════════════════════════════════════════════════════════════════════════

interface ServiceCheck {
  status: 'ok' | 'error' | 'degraded'
  latency?: number
  error?: string
}

async function checkService(
  name: string,
  check: () => Promise<void>
): Promise<[string, ServiceCheck]> {
  const start = Date.now()
  try {
    await check()
    return [name, { status: 'ok', latency: Date.now() - start }]
  } catch (err: any) {
    return [name, { status: 'error', latency: Date.now() - start, error: err.message }]
  }
}

export async function GET() {
  const startTime = Date.now()

  try {
    // Check all external services in parallel
    const checks = await Promise.all([
      // Translation APIs
      checkService('mymemory', async () => {
        const res = await fetch('https://api.mymemory.translated.net/get?q=hello&langpair=en|es', {
          signal: AbortSignal.timeout(5000)
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (data.responseStatus !== 200) throw new Error('Invalid response')
      }),

      checkService('libretranslate', async () => {
        const res = await fetch('https://translate.fedilab.app/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: 'hello', source: 'en', target: 'es' }),
          signal: AbortSignal.timeout(5000)
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!data?.translatedText) throw new Error('No translation')
      }),

      checkService('lingva', async () => {
        const res = await fetch('https://lingva.ml/api/v1/en/es/hello', {
          headers: { 'User-Agent': 'VoxLink/14.1 (Health Check)' },
          signal: AbortSignal.timeout(5000)
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (!data?.translation) throw new Error('No translation')
      }),

      checkService('google', async () => {
        const res = await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=hello', {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
          signal: AbortSignal.timeout(5000)
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      }),

      // PeerJS signaling server
      checkService('peerjs', async () => {
        const res = await fetch('https://0.peerjs.com/', {
          signal: AbortSignal.timeout(5000)
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
      }),

      // STUN server check (Google's STUN is most reliable)
      checkService('stun', async () => {
        // Can't directly test STUN, but check if Google is reachable
        const res = await fetch('https://www.google.com/generate_204', {
          signal: AbortSignal.timeout(3000)
        })
        if (res.status !== 204) throw new Error(`HTTP ${res.status}`)
      }),
    ])

    // Convert to object
    const services: Record<string, ServiceCheck> = Object.fromEntries(checks)

    // Calculate overall status
    const okCount = checks.filter(([, c]) => c.status === 'ok').length
    const totalCount = checks.length

    // Translation needs at least 1 API working
    const translationApis = ['mymemory', 'libretranslate', 'lingva', 'google']
    const translationOk = translationApis.some(api => services[api]?.status === 'ok')

    // PeerJS needs to be working for video calls
    const peerOk = services.peerjs?.status === 'ok'

    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy'
    if (!translationOk || !peerOk) {
      overallStatus = 'unhealthy'
    } else if (okCount < totalCount) {
      overallStatus = 'degraded'
    }

    const responseTime = Date.now() - startTime

    return NextResponse.json({
      status: overallStatus,
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      version: '14.1.0',
      uptime: process.uptime(),
      summary: {
        ok: okCount,
        total: totalCount,
        translationAvailable: translationOk,
        videoCallAvailable: peerOk
      },
      services
    })
  } catch (error) {
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
      services: {
        server: { status: 'error', error: 'Health check failed' }
      }
    }, { status: 500 })
  }
}
