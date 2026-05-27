/*
 * 文件定位：Runtime foundation / project 声明式规格。
 * 核心目的：让开发者用 praxis.project({...}) 描述一个 project，而不触发磁盘或 runtime 副作用。
 */

export type PraxisProjectKind = "chat" | "workspace-project";

export type PraxisProjectAgentEntrySpec = {
  agentId?: string;
  entry?: string;
  exportName?: string;
  role?: "primary" | "sidecar" | "auxiliary";
  metadata?: Readonly<Record<string, unknown>>;
};

export type PraxisProjectWorkspaceSpec = {
  root?: "auto" | string;
  persistence?: "sqlite" | "memory";
  lock?: "exclusive";
  metadata?: Readonly<Record<string, unknown>>;
};

export type PraxisProjectSessionsSpec = {
  defaultAgent?: string;
  resume?: "auto" | "manual" | "disabled";
  fork?: "enabled" | "disabled";
  title?: "first-user-message" | "manual" | "agent-summary";
  metadata?: Readonly<Record<string, unknown>>;
};

export type PraxisProjectArtifactsSpec = {
  mode?: "project-shared" | "disabled";
  copyOnImport?: boolean;
  metadata?: Readonly<Record<string, unknown>>;
};

export type PraxisProjectSpecInput = {
  id?: string;
  name?: string;
  kind?: PraxisProjectKind;
  workspace?: PraxisProjectWorkspaceSpec;
  agents?: Readonly<Record<string, unknown | PraxisProjectAgentEntrySpec>>;
  sessions?: PraxisProjectSessionsSpec;
  artifacts?: PraxisProjectArtifactsSpec;
  metadata?: Readonly<Record<string, unknown>>;
};

export type PraxisProjectSpec = {
  kind: "praxis.projectSpec";
  schema: "praxis.projectSpec.v1";
  projectId?: string;
  name?: string;
  projectKind: PraxisProjectKind;
  workspace: Required<Pick<PraxisProjectWorkspaceSpec, "persistence" | "lock">> & PraxisProjectWorkspaceSpec;
  agents: Readonly<Record<string, PraxisProjectAgentEntrySpec>>;
  sessions: Required<Pick<PraxisProjectSessionsSpec, "resume" | "fork" | "title">> & PraxisProjectSessionsSpec;
  artifacts: Required<Pick<PraxisProjectArtifactsSpec, "mode" | "copyOnImport">> & PraxisProjectArtifactsSpec;
  metadata: Readonly<Record<string, unknown>>;
};

function normalizeAgentEntries(
  agents: PraxisProjectSpecInput["agents"],
): Readonly<Record<string, PraxisProjectAgentEntrySpec>> {
  if (agents === undefined) return {};
  return Object.fromEntries(Object.entries(agents).map(([key, value]) => {
    if (typeof value === "function") {
      return [key, { role: key === "primary" ? "primary" : "sidecar", metadata: { source: "class" } }];
    }
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const entry = value as PraxisProjectAgentEntrySpec;
      return [key, {
        ...entry,
        role: entry.role ?? (key === "primary" ? "primary" : "sidecar"),
      }];
    }
    return [key, { role: key === "primary" ? "primary" : "sidecar" }];
  }));
}

export function project(input: PraxisProjectSpecInput = {}): PraxisProjectSpec {
  return {
    kind: "praxis.projectSpec",
    schema: "praxis.projectSpec.v1",
    projectId: input.id?.trim() || undefined,
    name: input.name?.trim() || undefined,
    projectKind: input.kind ?? "workspace-project",
    workspace: {
      root: input.workspace?.root ?? "auto",
      persistence: input.workspace?.persistence ?? "sqlite",
      lock: input.workspace?.lock ?? "exclusive",
      metadata: input.workspace?.metadata,
    },
    agents: normalizeAgentEntries(input.agents),
    sessions: {
      defaultAgent: input.sessions?.defaultAgent,
      resume: input.sessions?.resume ?? "auto",
      fork: input.sessions?.fork ?? "enabled",
      title: input.sessions?.title ?? "first-user-message",
      metadata: input.sessions?.metadata,
    },
    artifacts: {
      mode: input.artifacts?.mode ?? "project-shared",
      copyOnImport: input.artifacts?.copyOnImport ?? true,
      metadata: input.artifacts?.metadata,
    },
    metadata: input.metadata ?? {},
  };
}

export const projectDescriptor = {
  surface: "runtime.projectPlane.projectSpec",
  schema: "praxis.projectSpec.v1",
  unsafeSideEffects: false,
} as const;
