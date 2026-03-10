/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Voxxo Brand Colors
        'voxxo-green': '#00DBA8',
        'link-blue': '#0088FF',
        'signal-pink': '#FF3B7A',
        'deep-space': '#0A0E14',
        'card-dark': '#1A1F2E',
        'void': '#060810',
        'void-light': '#0a0a0f',
      },
      fontFamily: {
        'syne': ['Syne', 'sans-serif'],
        'dm': ['DM Sans', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
