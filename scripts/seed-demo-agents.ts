export type DemoAgentSeed = {
  id: string;
  name: 'Aurora' | 'Vesper' | 'Helix';
  goal: string;
  heartbeatEveryMs: number;
  enabled: false;
};

// Prompt 5 seeds durable heartbeat configuration only. Prompt 9 will enable and run these demo agents.
export const demoAgentSeeds: DemoAgentSeed[] = [
  { id: 'demo-aurora', name: 'Aurora', goal: 'Morning research and news synthesis agent', heartbeatEveryMs: 60_000, enabled: false },
  { id: 'demo-vesper', name: 'Vesper', goal: 'Evening portfolio and market snapshot agent', heartbeatEveryMs: 60_000, enabled: false },
  { id: 'demo-helix', name: 'Helix', goal: 'Developer code-review and analytics agent', heartbeatEveryMs: 60_000, enabled: false },
];
