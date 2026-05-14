import { keccak256, toUtf8Bytes } from 'ethers';

export const APOGEE_CHAIN_ID = 16661;
export const DEPLOY_AUTH_VERIFYING_CONTRACT = '0x0000000000000000000000000000000000000000';

export const DEPLOY_AUTH_DOMAIN = {
  name: 'Apogee',
  version: '1',
  chainId: APOGEE_CHAIN_ID,
  verifyingContract: DEPLOY_AUTH_VERIFYING_CONTRACT,
} as const;

export const DEPLOY_AUTH_TYPES: Record<string, Array<{ name: string; type: string }>> = {
  DeployAgentAuthorization: [
    { name: 'owner', type: 'address' },
    { name: 'name', type: 'string' },
    { name: 'descriptionHash', type: 'bytes32' },
    { name: 'skillsHash', type: 'bytes32' },
    { name: 'policyHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

export type DeployPolicyInput = Record<string, unknown> | undefined;

export type DeployAuthorizationInput = {
  owner: string;
  name: string;
  description?: string | undefined;
  skills?: string[] | undefined;
  policy?: DeployPolicyInput;
  nonce: string | bigint | number;
  deadline: string | bigint | number;
};

export type DeployAuthorizationMessage = {
  owner: string;
  name: string;
  descriptionHash: string;
  skillsHash: string;
  policyHash: string;
  nonce: string;
  deadline: string;
};

export type DeployAuthorizationTypedData = {
  domain: typeof DEPLOY_AUTH_DOMAIN;
  types: typeof DEPLOY_AUTH_TYPES;
  primaryType: 'DeployAgentAuthorization';
  message: DeployAuthorizationMessage;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeForCanonicalJson(value: unknown, parentKey?: string): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => normalizeForCanonicalJson(entry));
    if ((parentKey === 'allowedSkills' || parentKey === 'allowedActions') && normalized.every((entry) => typeof entry === 'string')) {
      return [...normalized].sort();
    }
    return normalized;
  }
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, normalizeForCanonicalJson(value[key], key)]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeForCanonicalJson(value));
}

export function hashDescription(description?: string | null): string {
  return keccak256(toUtf8Bytes(description ?? ''));
}

export function hashSkills(skills?: string[] | null): string {
  const normalized = [...new Set((skills ?? []).map(String))].sort();
  return keccak256(toUtf8Bytes(canonicalJson(normalized)));
}

export function hashPolicy(policy?: DeployPolicyInput | null): string {
  return keccak256(toUtf8Bytes(canonicalJson(policy ?? {})));
}

export function buildDeployAuthorizationMessage(input: DeployAuthorizationInput): DeployAuthorizationMessage {
  return {
    owner: input.owner,
    name: input.name,
    descriptionHash: hashDescription(input.description ?? ''),
    skillsHash: hashSkills(input.skills ?? []),
    policyHash: hashPolicy(input.policy ?? {}),
    nonce: String(input.nonce),
    deadline: String(input.deadline),
  };
}

export function buildDeployAuthorizationTypedData(input: DeployAuthorizationInput): DeployAuthorizationTypedData {
  return {
    domain: DEPLOY_AUTH_DOMAIN,
    types: DEPLOY_AUTH_TYPES,
    primaryType: 'DeployAgentAuthorization',
    message: buildDeployAuthorizationMessage(input),
  };
}
