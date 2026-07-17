/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#4f8cff',
        success: '#22c3a6',
        warning: '#f0b429',
        danger: '#ff5d6c',
        ink: {
          0: '#070b14',
          1: '#0c1220',
          2: '#111a2c',
          3: '#172236',
        },
      },
      boxShadow: {
        panel: '0 18px 50px rgba(0,0,0,0.35)',
      },
      borderRadius: {
        panel: '14px',
      },
    },
  },
  plugins: [],
}
