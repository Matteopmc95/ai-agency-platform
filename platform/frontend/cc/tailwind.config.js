/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#FFF5EF',
          100: '#FFE0CF',
          200: '#FFC29F',
          300: '#FFA26E',
          400: '#FF8440',
          500: '#FF6600',
          600: '#E85D00',
          700: '#BF4C00',
          800: '#933A00',
          900: '#6E2B00',
          950: '#3B1500',
        },
        ink: '#171717',
        sand: '#FAFAFA',
      },
      boxShadow: {
        soft: '0 12px 32px rgba(15, 23, 42, 0.08)',
      },
      fontFamily: {
        sans: ['"Instrument Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
