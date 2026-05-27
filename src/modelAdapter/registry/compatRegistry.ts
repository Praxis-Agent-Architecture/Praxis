import type { RaxProtocolId } from "../schema/index.js";

export type RaxProviderCompat = {
  providerId: string;
  protocolId: RaxProtocolId;
  supportsTools: boolean;
  supportsStreaming: boolean;
  supportsUsageInStreaming?: boolean;
  supportsDeveloperRole?: boolean;
  supportsStrictToolSchema?: boolean;
  supportsNativeTools?: string[];
  maxTokensField?: "max_tokens" | "max_completion_tokens" | "max_output_tokens";
  unsupportedToolSchemaKeywords?: string[];
  allowedNativeOptions?: string[];
};

export class RaxCompatRegistry {
  readonly entries = new Map<string, RaxProviderCompat>();

  register(entry: RaxProviderCompat): void {
    this.entries.set(entry.providerId, entry);
  }

  get(providerId: string): RaxProviderCompat | undefined {
    return this.entries.get(providerId);
  }

  list(): RaxProviderCompat[] {
    return [...this.entries.values()];
  }
}

export const defaultRaxCompatRegistry = new RaxCompatRegistry();

