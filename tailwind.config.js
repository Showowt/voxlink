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
        // ═══════════════════════════════════════════════════════════════════════
        // FLUID TYPOGRAPHY SYSTEM
        // Scales smoothly from 375px (iPhone SE) to 768px+ (tablet/desktop)
        // Formula: clamp(min, preferred, max) where preferred = vw-based
        // ═══════════════════════════════════════════════════════════════════════

        // Hero - Large impactful headlines
        // 28px @ 375px → 48px @ 768px+
        'hero': ['clamp(1.75rem, 5vw + 0.5rem, 3rem)', {
          lineHeight: '1.1',
          letterSpacing: '-0.025em',
          fontWeight: '700'
        }],

        // Display - Section headlines
        // 24px @ 375px → 36px @ 768px+
        'display': ['clamp(1.5rem, 4vw + 0.25rem, 2.25rem)', {
          lineHeight: '1.15',
          letterSpacing: '-0.02em',
          fontWeight: '700'
        }],

        // Title - Card titles, modal headers
        // 20px @ 375px → 32px @ 768px+
        'title': ['clamp(1.25rem, 3vw + 0.25rem, 2rem)', {
          lineHeight: '1.2',
          letterSpacing: '-0.015em',
          fontWeight: '600'
        }],

        // Subtitle - Secondary headings
        // 18px @ 375px → 24px @ 768px+
        'subtitle': ['clamp(1.125rem, 2.5vw + 0.25rem, 1.5rem)', {
          lineHeight: '1.25',
          letterSpacing: '-0.01em',
          fontWeight: '600'
        }],

        // Body Large - Emphasized body text, lead paragraphs
        // 16px @ 375px → 18px @ 768px+
        'body-lg': ['clamp(1rem, 2vw + 0.125rem, 1.125rem)', {
          lineHeight: '1.6',
          letterSpacing: '0'
        }],

        // Body - Standard body text
        // 14px @ 375px → 16px @ 768px+
        'body': ['clamp(0.875rem, 1.5vw + 0.25rem, 1rem)', {
          lineHeight: '1.6',
          letterSpacing: '0'
        }],

        // Body Small - Compact body text
        // 13px @ 375px → 14px @ 768px+
        'body-sm': ['clamp(0.8125rem, 1.25vw + 0.25rem, 0.875rem)', {
          lineHeight: '1.5',
          letterSpacing: '0.005em'
        }],

        // Caption - Labels, meta text
        // 12px @ 375px → 14px @ 768px+
        'caption': ['clamp(0.75rem, 1.5vw, 0.875rem)', {
          lineHeight: '1.4',
          letterSpacing: '0.01em'
        }],

        // Tiny - Micro text, badges, timestamps
        // 10px @ 375px → 12px @ 768px+
        'tiny': ['clamp(0.625rem, 1vw + 0.125rem, 0.75rem)', {
          lineHeight: '1.4',
          letterSpacing: '0.02em'
        }],

        // Code - Monospace text
        // 12px @ 375px → 14px @ 768px+
        'code': ['clamp(0.75rem, 1.25vw + 0.125rem, 0.875rem)', {
          lineHeight: '1.5',
          letterSpacing: '0'
        }],

        // Button - Button text (stable, minimal scaling)
        // 14px @ 375px → 16px @ 768px+
        'btn': ['clamp(0.875rem, 1vw + 0.5rem, 1rem)', {
          lineHeight: '1',
          letterSpacing: '0.01em',
          fontWeight: '600'
        }],

        // Button Small
        // 12px @ 375px → 14px @ 768px+
        'btn-sm': ['clamp(0.75rem, 0.75vw + 0.5rem, 0.875rem)', {
          lineHeight: '1',
          letterSpacing: '0.01em',
          fontWeight: '600'
        }],

        // Input - Form input text
        // 16px (iOS zoom prevention) → 16px (stable)
        'input': ['1rem', {
          lineHeight: '1.5',
          letterSpacing: '0'
        }],
      },
      letterSpacing: {
        'tightest': '-0.04em',
        'tighter': '-0.025em',
        'tight': '-0.02em',
        'snug': '-0.01em',
        'normal': '0',
        'relaxed': '0.01em',
        'wide': '0.025em',
        'wider': '0.05em',
        'widest': '0.1em',
        'brand': '0.15em',
      },
      // Line height scale for fluid typography
      lineHeight: {
        'tighter': '1.1',
        'tight': '1.2',
        'snug': '1.25',
        'normal': '1.5',
        'relaxed': '1.6',
        'loose': '1.75',
        'looser': '2',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        'safe-left': 'env(safe-area-inset-left, 0px)',
        'safe-right': 'env(safe-area-inset-right, 0px)',
      },
      height: {
        'screen-safe': '100dvh',
      },
      minHeight: {
        'screen-safe': '100dvh',
      },
      maxHeight: {
        'screen-safe': '100dvh',
      },
      inset: {
        'safe-top': 'env(safe-area-inset-top, 0px)',
        'safe-bottom': 'env(safe-area-inset-bottom, 0px)',
        'safe-left': 'env(safe-area-inset-left, 0px)',
        'safe-right': 'env(safe-area-inset-right, 0px)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
        '4xl': '2rem',
      },
      backdropBlur: {
        'xs': '2px',
        'sm': '8px',
        'md': '12px',
        'lg': '16px',
        'xl': '24px',
        '2xl': '40px',
        '3xl': '64px',
        'premium': '40px', /* iOS Control Center level blur */
      },
      backdropSaturate: {
        '100': '1',
        '120': '1.2',
        '150': '1.5',
        '180': '1.8',
        '200': '2',
      },
      boxShadow: {
        // ─────────────────────────────────────────────────────────────────────────
        // PREMIUM GLASS SHADOWS - Apple-level depth with inner highlights
        // ─────────────────────────────────────────────────────────────────────────

        // Standard glass - for cards and containers
        'glass': '0 4px 24px rgba(0, 0, 0, 0.4), 0 0 0 0.5px rgba(255, 255, 255, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        'glass-lg': '0 8px 32px rgba(0, 0, 0, 0.5), 0 0 0 0.5px rgba(255, 255, 255, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'glass-xl': '0 16px 64px rgba(0, 0, 0, 0.6), 0 0 0 0.5px rgba(255, 255, 255, 0.08), inset 0 1px 0 rgba(255, 255, 255, 0.12)',

        // Premium glass - iOS Control Center quality
        'glass-premium': '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 0.5px rgba(255, 255, 255, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.1), inset 0 -1px 0 rgba(0, 0, 0, 0.1)',
        'glass-elevated': '0 8px 32px rgba(0, 0, 0, 0.5), 0 16px 64px rgba(0, 0, 0, 0.3), 0 0 0 0.5px rgba(255, 255, 255, 0.06), inset 0 1px 0 rgba(255, 255, 255, 0.1)',

        // Glow effects - enhanced with double layer
        'glow-voxxo': '0 0 40px rgba(0, 229, 160, 0.3), 0 0 80px rgba(0, 229, 160, 0.15)',
        'glow-voxxo-lg': '0 0 60px rgba(0, 229, 160, 0.4), 0 0 120px rgba(0, 229, 160, 0.2)',
        'glow-blue': '0 0 40px rgba(0, 136, 255, 0.3), 0 0 80px rgba(0, 136, 255, 0.15)',
        'glow-gold': '0 0 40px rgba(245, 184, 0, 0.3), 0 0 80px rgba(245, 184, 0, 0.15)',

        // Button shadows - with inner highlight for depth
        'btn-primary': '0 4px 20px rgba(0, 229, 160, 0.25), 0 8px 40px rgba(0, 229, 160, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.2)',
        'btn-primary-hover': '0 6px 30px rgba(0, 229, 160, 0.35), 0 12px 50px rgba(0, 229, 160, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
        'btn-glass': '0 4px 16px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
        'btn-glass-hover': '0 6px 24px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.12)',

        // Inner highlights - subtle top edge light
        'inner-light': 'inset 0 1px 0 rgba(255, 255, 255, 0.08)',
        'inner-light-strong': 'inset 0 1px 0 rgba(255, 255, 255, 0.12)',
        'inner-depth': 'inset 0 1px 0 rgba(255, 255, 255, 0.08), inset 0 -1px 0 rgba(0, 0, 0, 0.05)',

        // Status glows with inner highlight
        'glow-error': '0 0 20px rgba(255, 71, 87, 0.3), inset 0 1px 0 rgba(255, 71, 87, 0.1)',
        'glow-success': '0 0 20px rgba(0, 230, 118, 0.3), inset 0 1px 0 rgba(0, 230, 118, 0.1)',
        'glow-warning': '0 0 20px rgba(255, 184, 0, 0.3), inset 0 1px 0 rgba(255, 184, 0, 0.1)',
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
        // Background orb floating animations
        'float-orb': 'floatOrb 20s ease-in-out infinite',
        'float-orb-slow': 'floatOrb 25s ease-in-out infinite',
        'float-orb-reverse': 'floatOrb 22s ease-in-out infinite reverse',
      },
      keyframes: {
        // GPU-ACCELERATED KEYFRAMES FOR 60FPS
        // Using translate3d/scale3d triggers GPU compositing
        fadeUp: {
          '0%': { opacity: '0', transform: 'translate3d(0, 20px, 0)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translate3d(0, 12px, 0)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translate3d(0, -12px, 0)' },
          '100%': { opacity: '1', transform: 'translate3d(0, 0, 0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale3d(0.95, 0.95, 1)' },
          '100%': { opacity: '1', transform: 'scale3d(1, 1, 1)' },
        },
        // GPU-accelerated glow using opacity/scale instead of box-shadow
        glowPulse: {
          '0%, 100%': { opacity: '0.3', transform: 'scale3d(1, 1, 1)' },
          '50%': { opacity: '0.6', transform: 'scale3d(1.02, 1.02, 1)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        // GPU-accelerated shimmer using transform instead of background-position
        shimmer: {
          '0%': { transform: 'translate3d(-100%, 0, 0)' },
          '100%': { transform: 'translate3d(100%, 0, 0)' },
        },
        radarSweep: {
          '0%': { transform: 'rotate3d(0, 0, 1, 0deg)' },
          '100%': { transform: 'rotate3d(0, 0, 1, 360deg)' },
        },
        bounceSoft: {
          '0%': { transform: 'scale3d(0.95, 0.95, 1)' },
          '50%': { transform: 'scale3d(1.05, 1.05, 1)' },
          '100%': { transform: 'scale3d(1, 1, 1)' },
        },
        // Float animation for background orbs
        floatOrb: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '25%': { transform: 'translate3d(10px, -20px, 0)' },
          '50%': { transform: 'translate3d(20px, 0, 0)' },
          '75%': { transform: 'translate3d(10px, 20px, 0)' },
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
