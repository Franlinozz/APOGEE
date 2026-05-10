import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'Apogee Protocol',
    template: '%s — Apogee',
  },
  description:
    'The runtime layer for autonomous AI agents on 0G — self-custodial wallets, encrypted memory, agent-to-agent payment rails, and verifiable on-chain receipts.',
  keywords: ['0G', '0G blockchain', 'autonomous agents', 'AI agents', 'smart wallet', 'on-chain', 'web3'],
  openGraph: {
    type: 'website',
    title: 'Apogee Protocol',
    description: 'The runtime where autonomous agents earn their keep.',
    siteName: 'Apogee',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Apogee Protocol',
    description: 'The runtime where autonomous agents earn their keep.',
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#080A12',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
    >
      <body>{children}</body>
    </html>
  );
}
