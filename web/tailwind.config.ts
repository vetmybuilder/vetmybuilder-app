import type { Config } from 'tailwindcss'
const config: Config = {
  content: ['./pages/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './app/**/*.{ts,tsx}'],
  theme: {
    extend: {
      keyframes: {
        'slide-in-left': {
          '0%': { opacity: '0', transform: 'translateX(-120px) scale(0.95)' },
          '60%': { opacity: '1', transform: 'translateX(8px) scale(1)' },
          '100%': { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
      },
      animation: {
        'slide-in-left': 'slide-in-left 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s both',
      },
      transitionDuration: {
        '350': '350ms',
      },
    },
  },
  plugins: [],
}
export default config
