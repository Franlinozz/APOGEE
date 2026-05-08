import { SkillRegistry } from '@apogee/skills-runtime';

import audioTranscribeManifest from '../audio.transcribe/manifest.js';
import audioTranscribeHandler from '../audio.transcribe/handler.js';
import chainQueryManifest from '../chain.query/manifest.js';
import chainQueryHandler from '../chain.query/handler.js';
import chainSendManifest from '../chain.send/manifest.js';
import chainSendHandler from '../chain.send/handler.js';
import chatCompletionManifest from '../chat.completion/manifest.js';
import chatCompletionHandler from '../chat.completion/handler.js';
import chatEmbedManifest from '../chat.embed/manifest.js';
import chatEmbedHandler from '../chat.embed/handler.js';
import imageGenerateManifest from '../image.generate/manifest.js';
import imageGenerateHandler from '../image.generate/handler.js';
import memoryReadManifest from '../memory.read/manifest.js';
import memoryReadHandler from '../memory.read/handler.js';
import memorySearchManifest from '../memory.search/manifest.js';
import memorySearchHandler from '../memory.search/handler.js';
import memoryWriteManifest from '../memory.write/manifest.js';
import memoryWriteHandler from '../memory.write/handler.js';
import storageUploadManifest from '../storage.upload/manifest.js';
import storageUploadHandler from '../storage.upload/handler.js';
import webFetchManifest from '../web.fetch/manifest.js';
import webFetchHandler from '../web.fetch/handler.js';
import webSearchManifest from '../web.search/manifest.js';
import webSearchHandler from '../web.search/handler.js';

export const coreSkills = [
  [audioTranscribeManifest, audioTranscribeHandler],
  [chainQueryManifest, chainQueryHandler],
  [chainSendManifest, chainSendHandler],
  [chatCompletionManifest, chatCompletionHandler],
  [chatEmbedManifest, chatEmbedHandler],
  [imageGenerateManifest, imageGenerateHandler],
  [memoryReadManifest, memoryReadHandler],
  [memorySearchManifest, memorySearchHandler],
  [memoryWriteManifest, memoryWriteHandler],
  [storageUploadManifest, storageUploadHandler],
  [webFetchManifest, webFetchHandler],
  [webSearchManifest, webSearchHandler],
] as const;

export function registerCoreSkills(registry = new SkillRegistry()): SkillRegistry {
  for (const [manifest, handler] of coreSkills) registry.register(manifest, handler);
  return registry;
}
