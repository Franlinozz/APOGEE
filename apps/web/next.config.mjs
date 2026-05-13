import bundleAnalyzer from '@next/bundle-analyzer';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  transpilePackages: ['@apogee/ui'],

  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },

  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [],
  },

  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },

  webpack(config, { isServer }) {
    config.resolve.extensionAlias = {
      '.js': ['.ts', '.tsx', '.js'],
      '.jsx': ['.tsx', '.jsx'],
    };

    // WalletConnect → @walletconnect/logger → pino@7 → pino-pretty (browser crash).
    // Use a real stub module so webpack emits no warning and pino's try-catch
    // gets a callable no-op instead of a missing-module error.
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        'pino-pretty': path.resolve(__dirname, 'src/lib/pino-stub.js'),
        'encoding': false,
      };
    }

    return config;
  },
};

export default withBundleAnalyzer(nextConfig);
