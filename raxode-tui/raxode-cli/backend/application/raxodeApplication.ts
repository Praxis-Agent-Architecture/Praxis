import type { RaxodeBackendModuleId } from "./backendModuleInventory.js";

export type RaxodeApplicationDescriptor = {
  readonly kind: "raxode.applicationDescriptor";
  readonly schemaVersion: "raxode.applicationDescriptor.v1";
  readonly id: "application.raxode.coding";
  readonly displayName: string;
  readonly primaryAgentRef: string;
  readonly entrypoints: {
    readonly raxProject: string;
    readonly raxAgentEntry: string;
    readonly localRunner: string;
    readonly backendModule: string;
    readonly contractsModule: string;
  };
  readonly surfaces: {
    readonly applicationLayer: string;
    readonly tui: string;
    readonly approval: string;
    readonly reports: string;
    readonly sessions: string;
  };
  readonly runtimePorts: readonly string[];
  readonly configuration: {
    readonly defaultPolicyProfile: "permissive";
    readonly defaultToolProfile: "agentCore";
    readonly defaultSandboxProfile: "host-observed";
    readonly defaultPersistence: "sqlite";
    readonly modelRoles: readonly ["core.main", "tui.main"];
  };
  readonly readiness: {
    readonly eventId: "raxode.backend.readiness";
    readonly contractKind: "raxode.backendReadiness";
    readonly moduleInventoryKind: "raxode.backendModuleInventory";
    readonly localProbeKind: "raxode.localReadinessProbe";
    readonly moduleIds: readonly RaxodeBackendModuleId[];
  };
};

export const RAXODE_BACKEND_MODULE_IDS = [
  "basetool",
  "promptPack",
  "context",
  "memory",
  "dependency",
  "auth",
  "projectSession",
  "modelAdapter",
  "sandbox",
  "cache",
  "multiagent",
] as const satisfies readonly RaxodeBackendModuleId[];

export const raxodeApplication: RaxodeApplicationDescriptor = {
  kind: "raxode.applicationDescriptor",
  schemaVersion: "raxode.applicationDescriptor.v1",
  id: "application.raxode.coding",
  displayName: "Raxode Coding Application",
  primaryAgentRef: "agents/codingAgent",
  entrypoints: {
    raxProject: "rax.project.json",
    raxAgentEntry: "agents/codingAgent/praxis.agent.ts",
    localRunner: "application/runRaxodeBackend.ts",
    backendModule: "raxodeBackend.ts",
    contractsModule: "../contracts.ts",
  },
  surfaces: {
    applicationLayer: "src/applicationLayer",
    tui: "raxode-cli/frontend",
    approval: "agents/codingAgent/interfaces/approvalSurface.ts",
    reports: "reports",
    sessions: ".raxode",
  },
  runtimePorts: [
    "approvalResolver",
    "agentReviewResolver",
    "contextArtifactAdapters",
    "baseToolAdapters",
    "authStateProvider",
    "foundationProject",
    "openFoundationProject",
    "liveProviderResolver",
  ],
  configuration: {
    defaultPolicyProfile: "permissive",
    defaultToolProfile: "agentCore",
    defaultSandboxProfile: "host-observed",
    defaultPersistence: "sqlite",
    modelRoles: ["core.main", "tui.main"],
  },
  readiness: {
    eventId: "raxode.backend.readiness",
    contractKind: "raxode.backendReadiness",
    moduleInventoryKind: "raxode.backendModuleInventory",
    localProbeKind: "raxode.localReadinessProbe",
    moduleIds: RAXODE_BACKEND_MODULE_IDS,
  },
} as const;
