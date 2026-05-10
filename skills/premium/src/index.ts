import { SkillRegistry } from '@apogee/skills-runtime';

import news_aggregateManifest from '../news.aggregate/manifest.js';
import news_aggregateHandler from '../news.aggregate/handler.js';
import social_postManifest from '../social.post/manifest.js';
import social_postHandler from '../social.post/handler.js';
import defi_snapshotManifest from '../defi.snapshot/manifest.js';
import defi_snapshotHandler from '../defi.snapshot/handler.js';
import nft_mintManifest from '../nft.mint/manifest.js';
import nft_mintHandler from '../nft.mint/handler.js';
import code_reviewManifest from '../code.review/manifest.js';
import code_reviewHandler from '../code.review/handler.js';
import pdf_extractManifest from '../pdf.extract/manifest.js';
import pdf_extractHandler from '../pdf.extract/handler.js';
import translateManifest from '../translate/manifest.js';
import translateHandler from '../translate/handler.js';
import summarize_longManifest from '../summarize.long/manifest.js';
import summarize_longHandler from '../summarize.long/handler.js';
import data_cleanManifest from '../data.clean/manifest.js';
import data_cleanHandler from '../data.clean/handler.js';
import analytics_reportManifest from '../analytics.report/manifest.js';
import analytics_reportHandler from '../analytics.report/handler.js';

export const premiumSkills = [
  [news_aggregateManifest, news_aggregateHandler],
  [social_postManifest, social_postHandler],
  [defi_snapshotManifest, defi_snapshotHandler],
  [nft_mintManifest, nft_mintHandler],
  [code_reviewManifest, code_reviewHandler],
  [pdf_extractManifest, pdf_extractHandler],
  [translateManifest, translateHandler],
  [summarize_longManifest, summarize_longHandler],
  [data_cleanManifest, data_cleanHandler],
  [analytics_reportManifest, analytics_reportHandler]
] as const;

export function registerPremiumSkills(registry = new SkillRegistry()): SkillRegistry {
  for (const [manifest, handler] of premiumSkills) registry.register(manifest, handler);
  return registry;
}
