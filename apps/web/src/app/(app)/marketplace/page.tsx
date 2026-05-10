import { Topbar } from '@/components/shell/Topbar';
import { MarketplaceTabs } from '@/components/marketplace/MarketplaceTabs';
import { getSkills, getServices } from '@/lib/api';

export const metadata = { title: 'Marketplace' };
export const revalidate = 300;

export default async function MarketplacePage() {
  const [skills, services] = await Promise.allSettled([getSkills(), getServices()]);

  return (
    <>
      <Topbar title="Marketplace" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-6xl">
          <MarketplaceTabs
            initialSkills={skills.status === 'fulfilled' ? skills.value : []}
            initialServices={services.status === 'fulfilled' ? services.value : []}
          />
        </div>
      </main>
    </>
  );
}
