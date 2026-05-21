export * from "./openaiCompatible.js";
export * from "./openai.js";
export * from "./deepseek.js";
export * from "./anthropic.js";
export * from "./google.js";

import { defaultRaxProviderRegistry } from "../registry/index.js";
import {
  createRaxModelClientFromProviders,
  createRaxProviderRegistry,
  type RaxProviderClientOptions,
  type RaxProviderRegistry,
} from "../registry/index.js";
import { anthropicProvider } from "./anthropic.js";
import { deepSeekProvider } from "./deepseek.js";
import { googleProvider } from "./google.js";
import { openAIProvider } from "./openai.js";

export const defaultRaxProviders = [
  openAIProvider,
  deepSeekProvider,
  anthropicProvider,
  googleProvider,
] as const;

export function registerDefaultRaxProviders(registry: RaxProviderRegistry = defaultRaxProviderRegistry): RaxProviderRegistry {
  for (const provider of defaultRaxProviders) registry.register(provider);
  return registry;
}

export function createDefaultRaxProviderRegistry(): RaxProviderRegistry {
  return createRaxProviderRegistry(defaultRaxProviders);
}

export function createDefaultRaxModelClient(options: RaxProviderClientOptions = {}) {
  return createRaxModelClientFromProviders(defaultRaxProviders, options);
}
