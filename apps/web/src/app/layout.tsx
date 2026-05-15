import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import dynamic from 'next/dynamic';
import { cookies } from 'next/headers';
import { WagmiProvider } from '@/components/providers/WagmiProvider';
import './globals.css';

const ApogeePilot = dynamic(
  () => import('@/components/apogee-pilot').then(m => m.ApogeeePilot),
  { ssr: false },
);

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
  icons: {
    icon: [
      { url: '/brand/apogee-mark-dark.svg', type: 'image/svg+xml' },
      { url: '/brand/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/brand/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: { url: '/brand/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    shortcut: ['/favicon.ico', '/brand/favicon.svg'],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: dark)',  color: '#080A12' },
    { media: '(prefers-color-scheme: light)', color: '#FBF8F9' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isAuthenticated = !!cookieStore.get('apogee-jwt')?.value;
  const themeCookie = cookieStore.get('apogee-theme')?.value;
  const theme = themeCookie === 'light' ? 'light' : themeCookie === 'dark' ? 'dark' : undefined;

  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
      suppressHydrationWarning
      data-theme={theme}
    >
      <head>
        {/*
          Anti-FOUC script: only runs when no cookie is set (first visit).
          Blocking inline script runs before CSS paint — no flash.
          Sets data-theme="light" if the system prefers light; otherwise
          the default dark theme from :root applies.
        */}
        {!theme && (
          <script
            dangerouslySetInnerHTML={{
              __html:
                `(function(){try{` +
                `if(window.matchMedia('(prefers-color-scheme:light)').matches){` +
                `document.documentElement.setAttribute('data-theme','light');` +
                `}}catch(e){}})()`,
            }}
          />
        )}
      </head>
      <body>
        <WagmiProvider>
          {children}
          <ApogeePilot isGuest={!isAuthenticated} />
        </WagmiProvider>
      </body>
    </html>
  );
}
