import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: { ink: '#080A12', line: 'rgba(255,255,255,0.12)', brand: '#8B5CF6' },
      boxShadow: { glow: '0 0 80px rgba(139, 92, 246, 0.28)' }
    }
  },
  plugins: []
};
export default config;
