import type { Config } from 'tailwindcss';
import preset from '@apogee/ui/tailwind-preset';

const config: Config = {
  presets: [preset as Config],
  content: [
    './src/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  plugins: [],
};
export default config;
