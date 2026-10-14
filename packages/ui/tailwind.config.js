import daisyui from 'daisyui'

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    '../shell/index.html',
    '../shell/src/**/*.{ts,js}',
    '../../apps/*/client/**/*.{ts,js}',
    './src/**/*.{ts,js}',
  ],
  theme: {
    extend: {},
  },
  plugins: [daisyui],
  daisyui: {
    themes: ['light', 'dark'],
  },
}
