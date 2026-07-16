/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        member: {
          camel: '#D8C798',
          'camel-light': '#E8DCC0',
          'camel-pale': '#F0E6CE',
          'camel-card': '#FAF4E8',
          gold: '#A88F61',
          'gold-deep': '#6B5A3E',
          'gold-soft': '#C4AE82',
          teal: '#2F8C95',
          'teal-deep': '#267880',
          'teal-pale': '#E2ECEA',
          text: '#3D3830',
          'text-muted': '#6B6358',
        },
      },
    },
  },
  plugins: [],
};
