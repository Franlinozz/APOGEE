import { WagmiProvider } from '@/components/providers/WagmiProvider';

export const metadata = { title: 'Connect Wallet' };

export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  return <WagmiProvider>{children}</WagmiProvider>;
}
