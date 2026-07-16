/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#6c63ff',
        success: '#00b894',
        warning: '#fdcb6e',
        danger: '#ff4757',
      },
    },
  },
  plugins: [],
}
