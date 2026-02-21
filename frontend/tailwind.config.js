/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f4f7f6',
          100: '#e7eeec',
          200: '#d5dfdc',
          300: '#bccac5',
          400: '#9eafa8',
          500: '#7f948c',
          600: '#677b74',
          700: '#53635d',
          800: '#424e49',
          900: '#313a36',
        },
        warm: {
          50: '#f7f7f5',
          100: '#efefeb',
          200: '#e1e2dc',
          300: '#ced0c8',
          400: '#b5b8ae',
          500: '#989c92',
          600: '#7d8179',
          700: '#656962',
          800: '#4f534d',
          900: '#393d38',
        },
      },
      fontFamily: {
        sans: ['Noto Sans KR', 'system-ui', 'sans-serif'],
        display: ['Noto Serif KR', 'Noto Sans KR', 'serif'],
      },
    },
  },
  plugins: [],
}
