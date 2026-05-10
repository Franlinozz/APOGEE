import { Topbar } from '@/components/shell/Topbar';
import { AgentWizard } from '@/components/agents/wizard/AgentWizard';

export const metadata = { title: 'New Agent' };

export default function NewAgentPage() {
  return (
    <>
      <Topbar title="New Agent" />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-2xl">
          <AgentWizard />
        </div>
      </main>
    </>
  );
}
