import type { Metadata, Viewport } from 'next'
import './globals.css'
import AppShell from './components/AppShell'

export const metadata: Metadata = {
  title: 'VoxLink - Real-Time Voice Translation | MachineMind',
  description: 'Break language barriers instantly. Free real-time voice translation between English and Spanish. Video calls, face-to-face conversations, and voice message translation. Works on any device.',
  manifest: '/manifest.json',
  applicationName: 'VoxLink',
  keywords: ['translation', 'voice translation', 'real-time translation', 'video call', 'English Spanish', 'translator', 'language', 'communication'],
  authors: [{ name: 'MachineMind', url: 'https://machinemindconsulting.com' }],
  creator: 'MachineMind',
  publisher: 'MachineMind',
  formatDetection: {
    telephone: false,
  },
  metadataBase: new URL('https://voxlink-v14.vercel.app'),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: 'https://voxlink-v14.vercel.app',
    title: 'VoxLink - Real-Time Voice Translation',
    description: 'Break language barriers instantly. Free real-time voice translation between English and Spanish.',
    siteName: 'VoxLink',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'VoxLink - Real-Time Voice Translation',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VoxLink - Real-Time Voice Translation',
    description: 'Break language barriers instantly. Free real-time voice translation.',
    images: ['/og-image.png'],
    creator: '@machinemindai',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [
      { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/icons/apple-icon-180.png', sizes: '180x180', type: 'image/png' },
    ],
    other: [
      { rel: 'mask-icon', url: '/icons/safari-pinned-tab.svg', color: '#06b6d4' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'VoxLink',
  },
  verification: {
    google: 'google-site-verification-code',
  },
  category: 'communication',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#06b6d4' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0f' },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* PWA & Mobile */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="VoxLink" />

        {/* Microsoft */}
        <meta name="msapplication-TileColor" content="#0a0a0f" />
        <meta name="msapplication-tap-highlight" content="no" />

        {/* Preconnect for performance */}
        <link rel="preconnect" href="https://0.peerjs.com" />
        <link rel="dns-prefetch" href="https://0.peerjs.com" />

        {/* Favicon fallbacks */}
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16.png" />
        <link rel="apple-touch-icon" href="/icons/apple-icon-180.png" />
      </head>
      <body className="safe-top safe-bottom overscroll-none">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
