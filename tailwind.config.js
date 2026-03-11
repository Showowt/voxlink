/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // ═══════════════════════════════════════════════════════════════════════
      // VOXXO PREMIUM DESIGN SYSTEM
      // Apple-level aesthetic with glassmorphism and depth
      // ═══════════════════════════════════════════════════════════════════════
      colors: {
        // Brand Primary
        'voxxo': {
          DEFAULT: '#00E5A0',
          50: '#E6FFF6',
          100: '#B3FFEA',
          200: '#80FFD9',
          300: '#4DFFBE',
          400: '#1AFFA3',
          500: '#00E5A0',
          600: '#00B87D',
          700: '#008A5E',
          800: '#005C3F',
          900: '#002E20',
        },
        // Accent Blue
        'accent': {
          DEFAULT: '#0088FF',
          light: '#4DA6FF',
          dark: '#0066CC',
        },
        // Backgrounds (void-first design)
        'void': {
          DEFAULT: '#030507',
          soft: '#060810',
          surface: '#0C1015',
          elevated: '#12171F',
          hover: '#1A202B',
          card: '#14191F',
        },
        // Status Colors
        'status': {
          success: '#00E676',
          warning: '#FFB800',
          error: '#FF4757',
          info: '#00B8FF',
        },
        // Legacy (for backwards compatibility)
        'voxxo-green': '#00E5A0',
        'link-blue': '#0088FF',
        'signal-pink': '#FF3B7A',
        'deep-space': '#0A0E14',
        'card-dark': '#1A1F2E',
        'gold': '#F5B800',
      },
      fontFamily: {
        'syne': ['Syne', 'sans-serif'],
        'dm': ['DM Sans', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace'],
        'display': ['Syne', 'sans-serif'],
        'body': ['DM Sans', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      fontSize: {
        'hero': ['clamp(2.5rem, 8vw, 5rem)', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'display': ['3rem', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        'title': ['2rem', { lineHeight: '1.2', letterSpacing: '-0.01em' }],
      },
      letterSpacing: {
        'tight': '-0.02em',
        'brand': '0.15em',
        'wider': '0.05em',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      backdropBlur: {
        'xs': '2px',
        'xl': '24px',
        '2xl': '40px',
        '3xl': '64px',
      },
      boxShadow: {
        // Glass shadows
        'glass': '0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04)',
        'glass-lg': '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.06)',
        'glass-xl': '0 16px 64px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.08)',
        // Glow effects
        'glow-voxxo': '0 0 40px rgba(0, 229, 160, 0.3), 0 0 80px rgba(0, 229, 160, 0.15)',
        'glow-blue': '0 0 40px rgba(0, 136, 255, 0.3), 0 0 80px rgba(0, 136, 255, 0.15)',
        'glow-gold': '0 0 40px rgba(245, 184, 0, 0.3), 0 0 80px rgba(245, 184, 0, 0.15)',
        // Button shadows
        'btn-primary': '0 4px 20px rgba(0, 229, 160, 0.25)',
        'btn-primary-hover': '0 8px 30px rgba(0, 229, 160, 0.35)',
        // Inner highlights
        'inner-light': 'inset 0 1px 1px rgba(255, 255, 255, 0.05)',
        // Error/status glows
        'glow-error': '0 0 20px rgba(255, 71, 87, 0.3)',
        'glow-success': '0 0 20px rgba(0, 230, 118, 0.3)',
      },
      animation: {
        'fade-up': 'fadeUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'scale-in': 'scaleIn 0.3s ease',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'spin-slow': 'spin 3s linear infinite',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s linear infinite',
        'radar-sweep': 'radarSweep 2s linear infinite',
        'bounce-soft': 'bounceSoft 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        glowPulse: {
          '0%, 100%': { boxShadow: '0 0 20px rgba(0, 229, 160, 0.3)' },
          '50%': { boxShadow: '0 0 40px rgba(0, 229, 160, 0.5), 0 0 60px rgba(0, 229, 160, 0.2)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        radarSweep: {
          '0%': { transform: 'rotate(0deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        bounceSoft: {
          '0%': { transform: 'scale(0.95)' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)' },
        },
      },
      transitionTimingFunction: {
        'bounce-out': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
        'spring': 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
      },
      transitionDuration: {
        '250': '250ms',
        '350': '350ms',
        '400': '400ms',
      },
      backgroundImage: {
        // Gradient meshes for premium backgrounds
        'mesh-voxxo': 'radial-gradient(at 0% 0%, rgba(0, 229, 160, 0.08) 0%, transparent 50%), radial-gradient(at 100% 100%, rgba(0, 136, 255, 0.08) 0%, transparent 50%)',
        'mesh-premium': 'radial-gradient(ellipse at top left, rgba(0, 229, 160, 0.1), transparent 50%), radial-gradient(ellipse at bottom right, rgba(0, 136, 255, 0.1), transparent 50%)',
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        // Glass surface gradients
        'glass-surface': 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
        'glass-border': 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
      },
    },
  },
  plugins: [],
}
