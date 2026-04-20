/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF8F0',
          100: '#FFE6C8',
          200: '#FED3A0',
          300: '#FEC079',
          400: '#FEAC51',
          500: '#FF9828',
          600: '#FF8300',
          700: '#CC6500',
          800: '#994800',
          900: '#662D00',
          950: '#331500',
        },
        ink: '#171717',
        sand: '#FAFAFA',
      },
      boxShadow: {
        soft: '0 12px 40px rgba(10, 10, 10, 0.08)',
      },
      fontFamily: {
        sans: ['"Instrument Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
