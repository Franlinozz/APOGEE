import { cookies } from 'next/headers';
import { PilotChatPage } from '@/components/apogee-pilot';
import { Topbar } from '@/components/shell/Topbar';

export const metadata = { title: 'Apogee Pilot' };

export default function ApogeePilotPage() {
  const isGuest = !cookies().get('apogee-jwt')?.value;

  return (
    <>
      <Topbar title="Apogee Pilot" />
      <main className="flex-1 overflow-hidden bg-app">
        <PilotChatPage isGuest={isGuest} />
      </main>
    </>
  );
}
