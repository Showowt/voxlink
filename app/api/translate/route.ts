import { NextRequest, NextResponse } from 'next/server'

// Force dynamic rendering
export const dynamic = 'force-dynamic'

// In-memory cache for translations with size limit
const MAX_CACHE_SIZE = 1000
const cache = new Map<string, { value: string; timestamp: number }>()

// Rate limiting per IP
const rateLimits = new Map<string, { count: number; resetAt: number }>()
const MAX_REQUESTS_PER_MINUTE = 60

function cleanCache() {
  if (cache.size > MAX_CACHE_SIZE) {
    // Remove oldest 20% of entries
    const entries = Array.from(cache.entries())
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
    const toRemove = Math.floor(entries.length * 0.2)
    for (let i = 0; i < toRemove; i++) {
      cache.delete(entries[i][0])
    }
  }
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const record = rateLimits.get(ip)

  if (!record || now > record.resetAt) {
    rateLimits.set(ip, { count: 1, resetAt: now + 60000 })
    return true
  }

  if (record.count >= MAX_REQUESTS_PER_MINUTE) {
    return false
  }

  record.count++
  return true
}

// Clean rate limits on each request (lightweight)
function cleanRateLimits() {
  const now = Date.now()
  for (const [key, record] of rateLimits.entries()) {
    if (now > record.resetAt) rateLimits.delete(key)
  }
}

// Common phrases dictionary with PROPER UTF-8 encoding
const dict: Record<string, Record<string, string>> = {
  'en-es': {
    'hello': 'hola',
    'hi': 'hola',
    'hey': 'oye',
    'how are you': 'cómo estás',
    'how are you doing': 'cómo te va',
    'good morning': 'buenos días',
    'good afternoon': 'buenas tardes',
    'good evening': 'buenas noches',
    'good night': 'buenas noches',
    'goodbye': 'adiós',
    'bye': 'adiós',
    'see you': 'nos vemos',
    'see you later': 'hasta luego',
    'thank you': 'gracias',
    'thanks': 'gracias',
    'thank you very much': 'muchas gracias',
    'please': 'por favor',
    'yes': 'sí',
    'no': 'no',
    'okay': 'está bien',
    'ok': 'está bien',
    'sorry': 'lo siento',
    'excuse me': 'disculpe',
    'i understand': 'entiendo',
    "i don't understand": 'no entiendo',
    'can you repeat': 'puede repetir',
    'can you repeat that': 'puede repetir eso',
    'nice to meet you': 'mucho gusto',
    'my name is': 'me llamo',
    'what is your name': 'cómo te llamas',
    "what's your name": 'cómo te llamas',
    'where are you from': 'de dónde eres',
    'i am from': 'soy de',
    "i'm from": 'soy de',
    'how much': 'cuánto cuesta',
    'how much is it': 'cuánto cuesta',
    'what time': 'qué hora es',
    'what time is it': 'qué hora es',
    'i need help': 'necesito ayuda',
    'help me': 'ayúdame',
    'one moment': 'un momento',
    'wait': 'espera',
    'yes please': 'sí por favor',
    'no thank you': 'no gracias',
    'i like it': 'me gusta',
    "i don't like it": 'no me gusta',
    'where is': 'dónde está',
    'what is this': 'qué es esto',
    'i want': 'quiero',
    'i need': 'necesito',
    'can i have': 'puedo tener',
    'the bill please': 'la cuenta por favor',
    'water': 'agua',
    'food': 'comida',
    'bathroom': 'baño',
    'help': 'ayuda',
    'police': 'policía',
    'doctor': 'médico',
    'hospital': 'hospital',
    'i love you': 'te quiero',
    'good': 'bueno',
    'bad': 'malo',
    'very good': 'muy bueno',
    'delicious': 'delicioso',
    'beautiful': 'hermoso',
    'today': 'hoy',
    'tomorrow': 'mañana',
    'yesterday': 'ayer',
    'now': 'ahora',
    'later': 'después',
    'always': 'siempre',
    'never': 'nunca',
    'more': 'más',
    'less': 'menos',
    'here': 'aquí',
    'there': 'allí',
    'left': 'izquierda',
    'right': 'derecha',
    'straight': 'recto',
  },
  'es-en': {
    'hola': 'hello',
    'oye': 'hey',
    'cómo estás': 'how are you',
    'cómo te va': 'how are you doing',
    'buenos días': 'good morning',
    'buenas tardes': 'good afternoon',
    'buenas noches': 'good evening',
    'adiós': 'goodbye',
    'nos vemos': 'see you',
    'hasta luego': 'see you later',
    'gracias': 'thank you',
    'muchas gracias': 'thank you very much',
    'por favor': 'please',
    'sí': 'yes',
    'no': 'no',
    'está bien': 'okay',
    'lo siento': 'sorry',
    'disculpe': 'excuse me',
    'perdón': 'sorry',
    'entiendo': 'i understand',
    'no entiendo': "i don't understand",
    'puede repetir': 'can you repeat',
    'mucho gusto': 'nice to meet you',
    'me llamo': 'my name is',
    'cómo te llamas': 'what is your name',
    'de dónde eres': 'where are you from',
    'soy de': 'i am from',
    'cuánto cuesta': 'how much is it',
    'qué hora es': 'what time is it',
    'necesito ayuda': 'i need help',
    'ayúdame': 'help me',
    'un momento': 'one moment',
    'espera': 'wait',
    'sí por favor': 'yes please',
    'no gracias': 'no thank you',
    'me gusta': 'i like it',
    'no me gusta': "i don't like it",
    'dónde está': 'where is',
    'qué es esto': 'what is this',
    'quiero': 'i want',
    'necesito': 'i need',
    'puedo tener': 'can i have',
    'la cuenta por favor': 'the bill please',
    'agua': 'water',
    'comida': 'food',
    'baño': 'bathroom',
    'ayuda': 'help',
    'policía': 'police',
    'médico': 'doctor',
    'hospital': 'hospital',
    'te quiero': 'i love you',
    'te amo': 'i love you',
    'bueno': 'good',
    'malo': 'bad',
    'muy bueno': 'very good',
    'delicioso': 'delicious',
    'hermoso': 'beautiful',
    'hoy': 'today',
    'mañana': 'tomorrow',
    'ayer': 'yesterday',
    'ahora': 'now',
    'después': 'later',
    'siempre': 'always',
    'nunca': 'never',
    'más': 'more',
    'menos': 'less',
    'aquí': 'here',
    'allí': 'there',
    'izquierda': 'left',
    'derecha': 'right',
    'recto': 'straight',
  }
}

// Primary translation API - MyMemory (free, no key needed)
async function translateMyMemory(text: string, from: string, to: string): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${from}|${to}&de=voxlink@machinemind.app`
    const res = await fetch(url, { 
      signal: AbortSignal.timeout(5000) // 5 second timeout
    })
    if (!res.ok) return null
    
    const data = await res.json()
    if (data.responseStatus === 200 && data.responseData?.translatedText) {
      const translated = data.responseData.translatedText
      // Filter out error messages
      if (translated.toUpperCase().includes('INVALID') || 
          translated.toUpperCase().includes('MYMEMORY') ||
          translated.toUpperCase().includes('LIMIT')) {
        return null
      }
      return translated
    }
    return null
  } catch { 
    return null 
  }
}

// Fallback #1 - LibreTranslate (multiple public instances)
async function translateLibre(text: string, from: string, to: string): Promise<string | null> {
  // Working public LibreTranslate instances (verified 2026)
  const instances = [
    'https://translate.fedilab.app',
    'https://libretranslate.pussthecat.org',
    'https://translate.adminforge.de',
  ]

  for (const instance of instances) {
    try {
      const res = await fetch(`${instance}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: from,
          target: to,
          format: 'text'
        }),
        signal: AbortSignal.timeout(5000)
      })

      if (!res.ok) continue

      const data = await res.json()
      if (data?.translatedText) {
        return data.translatedText
      }
    } catch {
      continue
    }
  }
  return null
}

// Fallback #2 - Lingva Translate (Google Translate frontend)
async function translateLingva(text: string, from: string, to: string): Promise<string | null> {
  // Working Lingva instances (verified 2026)
  const instances = [
    'https://lingva.ml',
    'https://lingva.lunar.icu',
    'https://translate.projectsegfau.lt',
  ]

  for (const instance of instances) {
    try {
      const url = `${instance}/api/v1/${from}/${to}/${encodeURIComponent(text)}`
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'VoxLink/14.1 (Translation App)'
        },
        signal: AbortSignal.timeout(5000)
      })

      if (!res.ok) continue

      const data = await res.json()
      if (data?.translation) {
        return data.translation
      }
    } catch {
      continue
    }
  }
  return null
}

// Fallback #3 - Google Translate (direct API, may be rate-limited)
async function translateGoogle(text: string, from: string, to: string): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      signal: AbortSignal.timeout(5000)
    })

    if (!res.ok) return null

    const data = await res.json()
    // Response format: [[["translation","original",null,null,10]],null,"en",...]
    if (Array.isArray(data) && Array.isArray(data[0])) {
      const translation = data[0].map((item: any) => item[0]).join('')
      if (translation && translation !== text) {
        return translation
      }
    }
    return null
  } catch {
    return null
  }
}

// Fallback #4 - DeepL Free (limited but high quality)
async function translateDeepL(text: string, from: string, to: string): Promise<string | null> {
  try {
    // DeepL uses uppercase language codes
    const sourceLang = from.toUpperCase()
    const targetLang = to.toUpperCase()

    const res = await fetch('https://api-free.deepl.com/v2/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        text: text,
        source_lang: sourceLang,
        target_lang: targetLang,
      }),
      signal: AbortSignal.timeout(5000)
    })

    // DeepL free requires API key, so this will fail without one
    // But we keep it for when users add their own key
    if (!res.ok) return null

    const data = await res.json()
    if (data?.translations?.[0]?.text) {
      return data.translations[0].text
    }
    return null
  } catch {
    return null
  }
}

// Simple rule-based translation for very common patterns
function simpleTranslate(text: string, from: string, to: string): string | null {
  // Only handles very basic single words as absolute fallback
  const words: Record<string, Record<string, string>> = {
    'en-es': {
      'yes': 'sí', 'no': 'no', 'hello': 'hola', 'bye': 'adiós',
      'thanks': 'gracias', 'please': 'por favor', 'sorry': 'lo siento'
    },
    'es-en': {
      'sí': 'yes', 'no': 'no', 'hola': 'hello', 'adiós': 'bye',
      'gracias': 'thanks', 'por favor': 'please', 'lo siento': 'sorry'
    }
  }
  
  const lookup = words[`${from}-${to}`]
  return lookup?.[text.toLowerCase().trim()] || null
}

export async function POST(req: NextRequest) {
  // Clean old rate limits
  cleanRateLimits()

  // Rate limiting
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { translation: '', error: 'Rate limit exceeded' },
      { status: 429 }
    )
  }

  try {
    const body = await req.json()
    const { text, sourceLang, targetLang } = body

    // Validation
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ translation: '', error: 'No text provided' }, { status: 400 })
    }
    
    const cleanText = text.trim()
    if (!cleanText) {
      return NextResponse.json({ translation: '' })
    }
    
    // Same language check
    if (sourceLang === targetLang) {
      return NextResponse.json({ translation: cleanText })
    }
    
    // Validate language codes
    const validLangs = ['en', 'es']
    if (!validLangs.includes(sourceLang) || !validLangs.includes(targetLang)) {
      return NextResponse.json({ translation: cleanText, error: 'Invalid language' })
    }

    // Check cache first
    const cacheKey = `${sourceLang}-${targetLang}:${cleanText.toLowerCase()}`
    const cached = cache.get(cacheKey)
    if (cached) {
      return NextResponse.json({ translation: cached.value, cached: true })
    }

    // Try dictionary lookup first (instant, no API call)
    const langPair = `${sourceLang}-${targetLang}`
    const dictLookup = dict[langPair]?.[cleanText.toLowerCase()]
    if (dictLookup) {
      cache.set(cacheKey, { value: dictLookup, timestamp: Date.now() })
      cleanCache()
      return NextResponse.json({ translation: dictLookup, source: 'dictionary' })
    }

    // SPEED + RELIABILITY: Run APIs in parallel layers with fallbacks
    // Layer 1: MyMemory + LibreTranslate (fastest, most reliable free APIs)
    const [myMemoryResult, libreResult] = await Promise.allSettled([
      translateMyMemory(cleanText, sourceLang, targetLang),
      translateLibre(cleanText, sourceLang, targetLang)
    ])

    let result: string | null = null
    let source = 'api'

    // Use MyMemory if successful (fastest)
    if (myMemoryResult.status === 'fulfilled' && myMemoryResult.value) {
      result = myMemoryResult.value
      source = 'mymemory'
    } else if (libreResult.status === 'fulfilled' && libreResult.value) {
      result = libreResult.value
      source = 'libretranslate'
    }

    // Layer 2: Lingva + Google (fallback APIs)
    if (!result) {
      console.log('Primary APIs failed, trying Lingva + Google...')
      const [lingvaResult, googleResult] = await Promise.allSettled([
        translateLingva(cleanText, sourceLang, targetLang),
        translateGoogle(cleanText, sourceLang, targetLang)
      ])

      if (lingvaResult.status === 'fulfilled' && lingvaResult.value) {
        result = lingvaResult.value
        source = 'lingva'
      } else if (googleResult.status === 'fulfilled' && googleResult.value) {
        result = googleResult.value
        source = 'google'
      }
    }

    // Layer 3: DeepL (requires API key, but try anyway)
    if (!result) {
      result = await translateDeepL(cleanText, sourceLang, targetLang)
      if (result) source = 'deepl'
    }

    // Layer 4: Simple word translation as last resort
    if (!result) {
      result = simpleTranslate(cleanText, sourceLang, targetLang)
      if (result) source = 'simple'
    }
    
    // Final fallback: return original text
    const translation = result || cleanText

    // Cache successful translations
    if (result) {
      cache.set(cacheKey, { value: translation, timestamp: Date.now() })
      cleanCache()
    }

    return NextResponse.json({
      translation,
      source: result ? source : 'passthrough'
    })
    
  } catch (error) {
    console.error('Translation error:', error)
    return NextResponse.json({ 
      translation: '', 
      error: 'Translation failed' 
    }, { status: 500 })
  }
}

// Also support GET for simple testing
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const text = searchParams.get('text')
  const from = searchParams.get('from') || 'en'
  const to = searchParams.get('to') || 'es'
  
  if (!text) {
    return NextResponse.json({ error: 'Missing text parameter' }, { status: 400 })
  }
  
  // Reuse POST logic
  const response = await POST(new NextRequest(req.url, {
    method: 'POST',
    body: JSON.stringify({ text, sourceLang: from, targetLang: to }),
    headers: { 'Content-Type': 'application/json' }
  }))
  
  return response
}
