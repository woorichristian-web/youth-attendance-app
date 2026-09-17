/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Ocean Blue palette — 랜딩페이지와 통일
        ocean: {
          50: '#F0F7FE',   // cream
          100: '#DCEBF8',  // cream-2
          200: '#A8CFEB',  // peach (light blue tint)
          300: '#7DB6DF',
          400: '#3A8FE0',  // primary (coral 역할)
          500: '#1F73CE',
          600: '#0F4FB5',  // deep (coral-2)
          700: '#0B3D8F',
          800: '#082C6B',
          900: '#0A1F3D',  // ink
        },
        teal: {
          400: '#5DD2E6',  // green (accent)
          600: '#0F8AB3',  // green-deep
        },
        ink: {
          DEFAULT: '#0A1F3D',
          soft: '#3A4E70',
          muted: '#7A8FAB',
        },
        // 기존 primary alias (호환)
        primary: {
          50: '#F0F7FE',
          100: '#DCEBF8',
          200: '#A8CFEB',
          300: '#7DB6DF',
          400: '#3A8FE0',
          500: '#3A8FE0',
          600: '#1F73CE',
          700: '#0F4FB5',
          800: '#0B3D8F',
          900: '#082C6B',
        },
      },
      boxShadow: {
        soft: '0 12px 40px -12px rgba(15,79,181,0.25), 0 4px 12px -4px rgba(10,31,61,0.08)',
        card: '0 4px 20px -8px rgba(15,79,181,0.12), 0 1px 3px rgba(10,31,61,0.05)',
      },
      fontFamily: {
        sans: ['"Noto Sans KR"', '"Gowun Dodum"', '-apple-system', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
    },
  },
  plugins: [],
};
