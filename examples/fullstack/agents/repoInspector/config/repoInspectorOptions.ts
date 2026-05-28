export type RepoInspectorMode = "quick" | "deep";

export type RepoInspectorPolicyProfile = "standard" | "restricted" | "permissive" | "yolo" | "bapr";

export type RepoInspectorSandboxProfile = "hostObserved" | "workspaceOnly" | "linuxBubblewrap";

export type RepoInspectorOptions = {
  mode?: RepoInspectorMode;
  policyProfile?: RepoInspectorPolicyProfile;
  sandboxProfile?: RepoInspectorSandboxProfile;
  includeShell?: boolean;
  includeSkillAuthoring?: boolean;
  includeAllTestable?: boolean;
  persistence?: "memory" | "sqlite";
};

export type NormalizedRepoInspectorOptions = Required<RepoInspectorOptions>;

export function normalizeRepoInspectorOptions(options: RepoInspectorOptions = {}): NormalizedRepoInspectorOptions {
  return {
    mode: options.mode ?? "quick",
    policyProfile: options.policyProfile ?? "standard",
    sandboxProfile: options.sandboxProfile ?? "hostObserved",
    includeShell: options.includeShell === true || options.includeAllTestable === true,
    includeSkillAuthoring: options.includeSkillAuthoring === true || options.includeAllTestable === true,
    includeAllTestable: options.includeAllTestable ?? false,
    persistence: options.persistence ?? "sqlite",
  };
}
