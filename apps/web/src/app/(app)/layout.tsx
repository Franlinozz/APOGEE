import { Sidebar } from '@/components/shell/Sidebar';

// WagmiProvider is mounted once in root layout — no second instance here.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
