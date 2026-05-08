import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import ivm from 'isolated-vm';
import pino, { type Logger } from 'pino';
import semver from 'semver';
import { z, type ZodSchema } from 'zod';

export type SideEffect = 'chain' | 'storage' | 'compute' | 'http';
export type SkillCode =
  | 'TIMEOUT'
  | 'VALIDATION'
  | 'EGRESS_DENIED'
  | 'INSUFFICIENT_FUNDS'
  | 'PROVIDER'
  | 'INTERNAL';

export interface SkillAuthor {
  name: string;
  agentId?: string | undefined;
}

export interface SkillManifest<I = unknown, O = unknown> {
  id: string;
  version: string;
  author: SkillAuthor;
  description: string;
  inputs: ZodSchema<I>;
  outputs: ZodSchema<O>;
  sideEffects: readonly SideEffect[];
  declaredEgress: readonly string[];
  pricePerCallWei: bigint;
  requiresEnv: readonly string[];
  timeoutMs: number;
}

export interface Provenance {
  chatIds: string[];
  storageRoots: string[];
  txHashes: string[];
  attestations: string[];
}

export interface SkillExecutionResult<T = unknown> {
  output: T;
  provenance: Provenance;
}

export interface SkillListFilter {
  sideEffect?: SideEffect | undefined;
  author?: string | undefined;
  freeOnly?: boolean | undefined;
}

export interface SkillHandlerContext {
  call(method: string, args: unknown): Promise<unknown>;
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: unknown): Promise<void>;
}

export type SkillHandler<I = unknown, O = unknown> = (input: I, ctx: SkillHandlerContext) => Promise<O> | O;

interface RegisteredSkill<I = unknown, O = unknown> {
  manifest: SkillManifest<I, O>;
  handler: SkillHandler<I, O>;
}

const dotCaseRegex = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/;
export const skillManifestSchema = z.object({
  id: z.string().regex(dotCaseRegex),
  version: z.string().refine((value) => semver.valid(value) !== null, 'version must be semver'),
  author: z.object({ name: z.string().min(1), agentId: z.string().optional() }),
  description: z.string().min(1),
  inputs: z.custom<ZodSchema>(),
  outputs: z.custom<ZodSchema>(),
  sideEffects: z.array(z.enum(['chain', 'storage', 'compute', 'http'])),
  declaredEgress: z.array(z.string().min(1)),
  pricePerCallWei: z.bigint().nonnegative(),
  requiresEnv: z.array(z.string().min(1)),
  timeoutMs: z.number().int().positive().default(30_000),
});

export class SkillError extends Error {
  constructor(
    public readonly code: SkillCode,
    message: string,
    public readonly userMessage: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class TimeoutError extends SkillError {
  constructor(message = 'Skill execution timed out', cause?: unknown) {
    super('TIMEOUT', message, 'The skill took too long to finish. Please try again.', cause);
  }
}

export class ValidationError extends SkillError {
  constructor(message = 'Skill validation failed', cause?: unknown) {
    super('VALIDATION', message, 'The skill received or returned invalid data.', cause);
  }
}

export class EgressDenied extends SkillError {
  constructor(host: string, cause?: unknown) {
    super('EGRESS_DENIED', `Egress denied for ${host}`, 'This skill tried to access an undeclared host.', cause);
  }
}

export class InsufficientFunds extends SkillError {
  constructor(message = 'Insufficient funds', cause?: unknown) {
    super('INSUFFICIENT_FUNDS', message, 'This skill needs more funds before it can run.', cause);
  }
}

export class ProviderError extends SkillError {
  constructor(message = 'Provider failed', cause?: unknown) {
    super('PROVIDER', message, 'A provider failed while running this skill.', cause);
  }
}

export class InternalError extends SkillError {
  constructor(message = 'Skill runtime failed', cause?: unknown) {
    super('INTERNAL', message, 'Something went wrong while running the skill.', cause);
  }
}

const emptyProvenance = (): Provenance => ({ chatIds: [], storageRoots: [], txHashes: [], attestations: [] });
const pushUnique = (items: string[], value: string | undefined): void => {
  if (value && !items.includes(value)) items.push(value);
};
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

export class SkillRegistry {
  private readonly skills = new Map<string, RegisteredSkill>();

  register<I, O>(manifest: SkillManifest<I, O>, handler: SkillHandler<I, O>): void {
    const parsed = skillManifestSchema.parse(manifest) as SkillManifest<I, O>;
    const key = this.key(parsed.id, parsed.version);
    if (this.skills.has(key)) throw new ValidationError(`Skill ${key} is already registered`);
    this.skills.set(key, { manifest: parsed, handler: handler as SkillHandler });
  }

  get(id: string, version?: string | undefined): RegisteredSkill {
    if (version) {
      const skill = this.skills.get(this.key(id, version));
      if (!skill) throw new ValidationError(`Skill ${id}@${version} is not registered`);
      return skill;
    }
    const matches = [...this.skills.values()].filter((skill) => skill.manifest.id === id);
    matches.sort((a, b) => semver.rcompare(a.manifest.version, b.manifest.version));
    const [latest] = matches;
    if (!latest) throw new ValidationError(`Skill ${id} is not registered`);
    return latest;
  }

  list(filter: SkillListFilter = {}): SkillManifest[] {
    return [...this.skills.values()]
      .map((skill) => skill.manifest)
      .filter((manifest) => (filter.sideEffect ? manifest.sideEffects.includes(filter.sideEffect) : true))
      .filter((manifest) => (filter.author ? manifest.author.name === filter.author : true))
      .filter((manifest) => (filter.freeOnly ? manifest.pricePerCallWei === 0n : true));
  }

  uninstall(id: string): void {
    for (const key of this.skills.keys()) {
      if (key.startsWith(`${id}@`)) this.skills.delete(key);
    }
  }

  private key(id: string, version: string): string {
    return `${id}@${version}`;
  }
}

export interface SkillRunnerContext {
  agentId: string;
  chainClient?: unknown;
  storageClient?: unknown;
  computeClient?: unknown;
  memory?: unknown;
  logger?: Logger | undefined;
  allowStorageWrite?: boolean | undefined;
  env?: Record<string, string | undefined> | undefined;
  fetchImpl?: typeof fetch | undefined;
}

export class SkillRunner {
  private readonly logger: Logger;

  constructor(private readonly registry: SkillRegistry, logger?: Logger | undefined) {
    this.logger = logger ?? pino({ name: 'apogee-skills-runtime' });
  }

  async execute(skillId: string, input: unknown, ctx: SkillRunnerContext): Promise<SkillExecutionResult> {
    const skill = this.registry.get(skillId);
    const manifest = skill.manifest;
    const missingEnv = manifest.requiresEnv.filter((name) => !ctx.env?.[name] && !process.env[name]);
    if (missingEnv.length > 0) throw new ValidationError(`Missing environment variables: ${missingEnv.join(', ')}`);
    let parsedInput: unknown;
    try {
      parsedInput = manifest.inputs.parse(input);
    } catch (error) {
      throw new ValidationError('Skill input validation failed', error);
    }
    const provenance = emptyProvenance();
    const runPromise = this.runInIsolate(skill.handler, parsedInput, manifest, ctx, provenance);
    const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new TimeoutError()), manifest.timeoutMs));
    try {
      const raw = await Promise.race([runPromise, timeoutPromise]);
      const output = manifest.outputs.parse(raw);
      return { output, provenance };
    } catch (error) {
      if (error instanceof SkillError) throw error;
      if (error instanceof z.ZodError) throw new ValidationError('Skill output validation failed', error);
      throw this.translateIsolateError(error);
    }
  }

  private translateIsolateError(error: unknown): SkillError {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Egress denied for ')) {
      return new EgressDenied(message.split('Egress denied for ')[1] ?? 'unknown', error);
    }
    if (message.includes('Skill execution timed out')) return new TimeoutError(message, error);
    if (message.includes('Insufficient funds')) return new InsufficientFunds(message, error);
    if (message.includes('validation') || message.includes('Validation')) return new ValidationError(message, error);
    if (message.includes('provider') || message.includes('Provider')) return new ProviderError(message, error);
    return new InternalError('Skill execution failed', error);
  }

  private async runInIsolate(
    handler: SkillHandler,
    input: unknown,
    manifest: SkillManifest,
    ctx: SkillRunnerContext,
    provenance: Provenance,
  ): Promise<unknown> {
    const isolate = new ivm.Isolate({ memoryLimit: 128 });
    try {
      const context = await isolate.createContext();
      const jail = context.global;
      await jail.set('globalThis', jail.derefInto());
      await jail.set('__input', new ivm.ExternalCopy(input).copyInto());
      await jail.set('__call', new ivm.Reference(async (method: string, args: unknown) => this.dispatch(method, args, manifest, ctx, provenance)));
      await jail.set('__log', new ivm.Reference(async (level: string, message: string, meta: unknown) => {
        const safeLevel = ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'info';
        this.logger[safeLevel as 'info']({ skillId: manifest.id, meta }, message);
      }));
      const source = `
        const handler = ${handler.toString()};
        const ctx = {
          call: (method, args) => __call.apply(undefined, [method, args], { arguments: { copy: true }, result: { promise: true, copy: true } }),
          log: (level, message, meta) => __log.apply(undefined, [level, message, meta], { arguments: { copy: true }, result: { promise: true, copy: true } })
        };
        globalThis.__run = async () => handler(__input, ctx);
      `;
      await isolate.compileScript(source).then((script) => script.run(context, { timeout: manifest.timeoutMs }));
      const result = await context.global.get('__run', { reference: true }).then((run) =>
        (run as ivm.Reference<() => Promise<unknown>>).apply(undefined, [], { result: { promise: true, copy: true }, timeout: manifest.timeoutMs }),
      );
      return result;
    } finally {
      isolate.dispose();
    }
  }

  private async dispatch(method: string, args: unknown, manifest: SkillManifest, ctx: SkillRunnerContext, provenance: Provenance): Promise<unknown> {
    const [namespace, action] = method.split('.');
    if (namespace === 'http') return this.http(action, args, manifest, ctx);
    if (namespace === 'compute') return this.callClient(ctx.computeClient, action, args, provenance, 'compute');
    if (namespace === 'storage') {
      if (action?.startsWith('upload') && !ctx.allowStorageWrite) throw new ProviderError('Storage write allowance is required');
      return this.callClient(ctx.storageClient, action, args, provenance, 'storage');
    }
    if (namespace === 'memory') return this.callClient(ctx.memory, action, args, provenance, 'memory');
    if (namespace === 'chain') return this.callClient(ctx.chainClient, action, args, provenance, 'chain');
    throw new ValidationError(`Unknown skill context method: ${method}`);
  }

  private async callClient(client: unknown, action: string | undefined, args: unknown, provenance: Provenance, kind: string): Promise<unknown> {
    if (!client || !action || !isRecord(client)) throw new ProviderError(`${kind} client is unavailable`);
    const fn = client[action];
    if (typeof fn !== 'function') throw new ValidationError(`${kind}.${action} is not available`);
    const list = Array.isArray(args) ? args : [args];
    if (kind === 'storage' && action === 'uploadBytes' && typeof list[0] === 'string') {
      list[0] = new TextEncoder().encode(list[0]);
    }
    if (kind === 'compute' && action === 'transcribe' && typeof list[0] === 'string') {
      list[0] = new URL(list[0]);
    }
    try {
      const result = (await fn.apply(client, list)) as unknown;
      this.capture(result, provenance);
      return result;
    } catch (error) {
      if (isRecord(error) && error.code === 'INSUFFICIENT_FUNDS') throw new InsufficientFunds(String(error.message ?? 'Insufficient funds'), error);
      throw new ProviderError(`${kind}.${action} failed`, error);
    }
  }

  private async http(action: string | undefined, args: unknown, manifest: SkillManifest, ctx: SkillRunnerContext): Promise<unknown> {
    if (action !== 'fetch') throw new ValidationError(`Unknown http action: ${action ?? 'missing'}`);
    if (!isRecord(args) || typeof args.url !== 'string') throw new ValidationError('http.fetch requires a url');
    const url = new URL(args.url);
    if (!manifest.declaredEgress.includes('*') && !manifest.declaredEgress.includes(url.hostname)) throw new EgressDenied(url.hostname);
    const maxBytes = typeof args.maxBytes === 'number' ? args.maxBytes : 1_048_576;
    const response = await (ctx.fetchImpl ?? fetch)(url, { method: 'GET' });
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) throw new ProviderError(`HTTP response exceeded ${maxBytes} bytes`);
    return { ok: response.ok, status: response.status, url: response.url, text: new TextDecoder().decode(buffer), contentType: response.headers.get('content-type') };
  }

  private capture(result: unknown, provenance: Provenance): void {
    if (!isRecord(result)) return;
    pushUnique(provenance.chatIds, typeof result.chatId === 'string' ? result.chatId : undefined);
    pushUnique(provenance.storageRoots, typeof result.rootHash === 'string' ? result.rootHash : undefined);
    pushUnique(provenance.storageRoots, typeof result.storageRoot === 'string' ? result.storageRoot : undefined);
    if (Array.isArray(result.storageRoots)) for (const root of result.storageRoots) pushUnique(provenance.storageRoots, typeof root === 'string' ? root : undefined);
    pushUnique(provenance.txHashes, typeof result.txHash === 'string' ? result.txHash : undefined);
    pushUnique(provenance.txHashes, typeof result.hash === 'string' ? result.hash : undefined);
    pushUnique(provenance.attestations, typeof result.attestationDigest === 'string' ? result.attestationDigest : undefined);
  }
}

export async function loadSkills(registry: SkillRegistry, roots = ['skills/core', 'skills/premium'], production = process.env.NODE_ENV === 'production'): Promise<number> {
  let count = 0;
  for (const root of roots) {
    let entries: string[] = [];
    try {
      entries = await readdir(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const manifestPath = join(process.cwd(), root, entry, 'manifest.js');
      const handlerPath = join(process.cwd(), root, entry, 'handler.js');
      const manifestModule = (await import(manifestPath)) as { default: SkillManifest };
      const handlerModule = (await import(handlerPath)) as { default: SkillHandler };
      registry.register(manifestModule.default, handlerModule.default);
      count += 1;
    }
  }
  if (!production) registry.list();
  return count;
}
