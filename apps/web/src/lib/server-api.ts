import { cookies } from 'next/headers';
import {
  getAgents,
  getAgent,
  createAgent,
  getPolicy,
  getRuns,
  getReceipts,
  getMemory,
  getDashboardStats,
  getReceiptHeatmap,
  getAgentSkills,
} from './api';

function tok(): string | undefined {
  return cookies().get('apogee-jwt')?.value;
}

export const serverGetAgents = () => getAgents(tok());
export const serverGetAgent = (id: string) => getAgent(id, tok());
export const serverCreateAgent = (data: Parameters<typeof createAgent>[0]) => createAgent(data, tok());
export const serverGetPolicy = (id: string) => getPolicy(id, tok());
export const serverGetRuns = (agentId: string) => getRuns(agentId, tok());
export const serverGetReceipts = (params?: Parameters<typeof getReceipts>[0]) => getReceipts(params, tok());
export const serverGetMemory = (agentId: string) => getMemory(agentId, tok());
export const serverGetDashboardStats = () => getDashboardStats(tok());
export const serverGetReceiptHeatmap = () => getReceiptHeatmap(tok());

export const serverGetAgentSkills = (agentId: string) => getAgentSkills(agentId, tok());
