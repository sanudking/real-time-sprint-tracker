/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: { extend: { fontFamily: { sans: ['Inter', 'sans-serif'], mono: ['IBM Plex Mono', 'monospace'] }, colors: { ink: '#09090b', panel: '#111114', line: '#27272a', muted: '#a1a1aa', accent: '#8b5cf6' } } },
  plugins: []
};
