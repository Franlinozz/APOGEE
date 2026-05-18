export interface AuthorizationProof {
  type: 'eip712';
  owner: string;
  signer: string;
  nonce: string;
  deadline: number;
  digest: string;
  signature?: string;
  createdAt: string;
  tokenId?: string;
  agentId?: string;
}

export interface Agent {
  id: string;
  name: string;
  ownerAddress: string;
  identityTokenId?: string;
  accountAddress?: string;
  hidden?: boolean;
  status: 'pending_deploy' | 'deployed' | 'activating' | 'initialized' | 'ready' | 'active' | 'paused' | 'failed' | 'deploying' | 'error';
  createdAt: string;
  updatedAt: string;
  policyId?: string;
  description?: string;
  deployment?: {
    chainId?: number;
    tokenId?: string;
    owner?: string;
    accountAddress?: string;
    controller?: string;
    name?: string;
    description?: string;
    selectedSkillIds?: string[];
    policy?: { maxPerTxWei?: string; dailyCapWei?: string; allowedSkills?: string[]; allowedActions?: string[] };
    createdAt?: string;
    identityMintTxHash?: string;
    accountDeployTxHash?: string;
    status?: string;
    error?: string;
    authorizationProof?: AuthorizationProof;
  };
  authorizationProof?: AuthorizationProof;
  avatarSeed?: string;
}

export interface Policy {
  id: string;
  agentId: string;
  version: number;
  maxPerTxWei: string;
  dailyCapWei: string;
  allowedContracts: string[];
  allowedSkills: string[];
  activeHoursStart: number;
  activeHoursEnd: number;
  requiresApprovalAboveWei: string;
  createdAt: string;
}

export interface Receipt {
  id: string;
  agentId: string;
  payerAddress: string;
  payeeAddress: string;
  amountWei: string;
  skillId?: string;
  txHash?: string;
  storageRoot?: string;
  attestationDigest?: string;
  status: 'pending' | 'confirmed' | 'failed';
  error?: string;
  createdAt: string;
}

export interface MemoryEntry {
  id: string;
  agentId: string;
  key: string;
  value: unknown;
  version: number;
  anchoredTxHash?: string;
  visibility?: 'system' | 'bootstrap' | 'private';
  tags?: string[];
  storageRoot?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  category: string;
  tier: 'free' | 'premium';
  pricePerCallWei: string;
  authorAddress?: string;
  tags: string[];
  live?: boolean;
}

export interface ServiceListing {
  id: string;
  providerAddress: string;
  name: string;
  description: string;
  modelId?: string;
  pricePerTokenWei: string;
  latencyMs?: number;
  uptime?: number;
  tags: string[];
}

export interface RunStep {
  id: string;
  runId: string;
  type: string;
  status: 'queued' | 'running' | 'success' | 'succeeded' | 'error' | 'failed';
  input?: unknown;
  output?: unknown;
  durationMs?: number;
  createdAt: string;
}

export interface Run {
  id: string;
  agentId: string;
  status: 'queued' | 'running' | 'success' | 'succeeded' | 'error' | 'failed';
  steps: RunStep[];
  createdAt: string;
  completedAt?: string;
}

export interface DashboardStats {
  totalAgents: number;
  totalReceipts: number;
  totalVolumeWei: string;
  activeAgents: number;
}

export interface HeatmapCell {
  day: number;
  hour: number;
  count: number;
}

export interface ApiError {
  status: number;
  title: string;
  detail?: string;
  code?: string;
}

export type AgentWizardStep = 'identity' | 'funding' | 'policy' | 'skills' | 'deploy';

export interface AgentWizardState {
  step: AgentWizardStep;
  identity: {
    name: string;
    description: string;
  };
  funding: {
    predictedAddress: string;
  };
  policy: {
    maxPerTxEth: string;
    dailyCapEth: string;
    allowedContracts: string[];
    allowedSkills: string[];
    activeHoursStart: number;
    activeHoursEnd: number;
    requiresApprovalAboveEth: string;
  };
  skills: string[];
  deployTxHash?: string;
}
