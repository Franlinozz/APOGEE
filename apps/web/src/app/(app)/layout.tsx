import { Sidebar } from '@/components/shell/Sidebar';
import { MobileMenu } from '@/components/shell/MobileMenu';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="app-shell flex h-screen overflow-hidden bg-bg">
      <MobileMenu />
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}
