/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}', './public/index.html'],
  theme: {
    extend: {
      colors: {
        ocean: {
          50: '#f0f7fe',
          100: '#dcebf8',
          200: '#a8cfeb',
          300: '#6fb0e6',
          400: '#3a8fe0',
          500: '#1f73ce',
          600: '#0f4fb5',
          700: '#0b3d8f',
          800: '#0a2f6b',
          900: '#0a1f3d',
        },
        ink: {
          DEFAULT: '#0a1f3d',
          soft: '#3a4e70',
          muted: '#7a8fab',
        },
      },
      fontFamily: {
        sans: ['Noto Sans KR', 'Gowun Dodum', '-apple-system', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 12px 40px -12px rgba(15,79,181,0.25), 0 4px 12px -4px rgba(10,31,61,0.08)',
      },
    },
  },
  plugins: [],
};
