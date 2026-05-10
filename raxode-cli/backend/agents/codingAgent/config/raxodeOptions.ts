export type RaxodePolicyProfile = "restricted" | "standard" | "permissive" | "yolo" | "bapr";

export type RaxodeSandboxProfile = "hostObserved" | "workspaceOnly" | "linuxBubblewrap";

export type RaxodeOptions = {
  policyProfile?: RaxodePolicyProfile;
  sandboxProfile?: RaxodeSandboxProfile;
  persistence?: "memory" | "sqlite";
  includeAllCatalogTools?: boolean;
  model?: string;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "none" | "minimal";
};

export type NormalizedRaxodeOptions = Required<RaxodeOptions>;

export function normalizeRaxodeOptions(options: RaxodeOptions = {}): NormalizedRaxodeOptions {
  return {
    policyProfile: options.policyProfile ?? "standard",
    sandboxProfile: options.sandboxProfile ?? "hostObserved",
    persistence: options.persistence ?? "sqlite",
    includeAllCatalogTools: options.includeAllCatalogTools ?? true,
    model: options.model ?? "gpt-5.5",
    reasoningEffort: options.reasoningEffort ?? "low",
  };
}

