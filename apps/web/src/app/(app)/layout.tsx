import { WagmiProvider } from '@/components/providers/WagmiProvider';
import { Sidebar } from '@/components/shell/Sidebar';

// Pilot is mounted once in root layout — no second instance here.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider>
      <div className="flex h-screen overflow-hidden bg-bg">
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          {children}
        </div>
      </div>
    </WagmiProvider>
  );
}
