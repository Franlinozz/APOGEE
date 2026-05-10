import bundleAnalyzer from '@next/bundle-analyzer';

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

  /* Silence the `app/` directory incremental type-checking in strict mode */
  typescript: { ignoreBuildErrors: false },
  eslint: { ignoreDuringBuilds: false },
};

export default withBundleAnalyzer(nextConfig);
