/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        member: {
          ivory: '#F7F2E8',
          'ivory-deep': '#EFE6D6',
          'ivory-card': '#FDFAF5',
          gold: '#BFA77A',
          'gold-soft': '#D8C9A8',
          emerald: '#1A7D76',
          'emerald-deep': '#145F5A',
          'emerald-light': '#E3EEEC',
          'emerald-muted': '#3A8A84',
          text: '#2A3836',
          'text-muted': '#5C6E6B',
        },
      },
    },
  },
  plugins: [],
};
