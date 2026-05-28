import { praxis } from "@praxis-ai/praxis";
import type {
  AgentIdentity,
  CapabilitySpec,
  DependencyDeclaration,
  BaseToolPolicyMatrixSpec,
  HarnessSpec,
  MainLoopSpec,
  ModelFleetSpec,
  ModelSpec,
  SandboxSpec,
  SessionSpec,
  StatePlaneSpec,
  StorageSpec,
} from "@praxis-ai/praxis";

import { createRaxodeIdentity } from "./config/identity.js";
import { createRaxodeModel, createRaxodeModelFleet } from "./config/modelFleet.js";
import type { RaxodeOptions } from "./config/raxodeOptions.js";
import { normalizeRaxodeOptions } from "./config/raxodeOptions.js";
import { createRaxodeHarness } from "./harness/harness.js";
import { createRaxodeMainLoop } from "./mainLoop/mainLoop.js";
import { createRaxodeToolPolicy } from "./policies/toolPolicy.js";
import { RaxodeCodingPrompt } from "./prompts/codingPrompt.js";
import { createRaxodeSandbox } from "./sandbox/profile.js";
import { createRaxodeStatePlane } from "./state/statePlane.js";
import { createRaxodeSession, createRaxodeStorage } from "./storage/storagePolicy.js";

export default class RaxodeCodingAgent extends praxis.AgentArchetype {
  identity: AgentIdentity;
  model: ModelSpec;
  modelFleet: ModelFleetSpec;
  promptPack: RaxodeCodingPrompt;
  mainLoop: MainLoopSpec;
  sandbox: SandboxSpec;
  toolPolicy: BaseToolPolicyMatrixSpec;
  storage: StorageSpec;
  session: SessionSpec;
  statePlane: StatePlaneSpec;
  harness: HarnessSpec;
  capabilities: readonly CapabilitySpec[];
  dependencies: readonly DependencyDeclaration[];

  constructor(options: RaxodeOptions = {}) {
    super();
    const normalized = normalizeRaxodeOptions(options);
    this.identity = createRaxodeIdentity();
    this.model = createRaxodeModel(normalized);
    this.modelFleet = createRaxodeModelFleet(normalized);
    this.promptPack = new RaxodeCodingPrompt({
      memoryPromptGuide: normalized.memoryPromptGuide,
    });
    this.mainLoop = createRaxodeMainLoop(normalized);
    this.sandbox = createRaxodeSandbox(normalized);
    this.toolPolicy = createRaxodeToolPolicy(normalized.policyProfile);
    this.storage = createRaxodeStorage(normalized);
    this.session = createRaxodeSession(normalized);
    this.statePlane = createRaxodeStatePlane();
    this.harness = createRaxodeHarness(normalized);
    const provision = createRaxodeProvisioning(normalized);
    this.capabilities = provision.capabilities;
    this.dependencies = provision.dependencies;
  }
}

function createRaxodeProvisioning(options: ReturnType<typeof normalizeRaxodeOptions>): {
  capabilities: readonly CapabilitySpec[];
  dependencies: readonly DependencyDeclaration[];
} {
  const sandboxIsolation = options.sandboxProfile === "linuxBubblewrap"
    ? "strong"
    : options.sandboxProfile === "workspaceOnly"
      ? "workspace"
      : "none";

  return praxis.capabilities([
    praxis.capability.sandbox({
      capabilityId: "capability.raxode.sandbox",
      isolation: sandboxIsolation,
      required: options.sandboxProfile === "linuxBubblewrap",
      reason: "Prepare the Raxode backend for governed shell, filesystem, and tool execution.",
      fallback: { allowWorkspaceRollback: true },
      metadata: {
        defaultPolicy: "permissive",
        selectedProfile: options.sandboxProfile,
        runtimeOwner: "praxis.applicationLayer",
      },
    }),
    praxis.capability.codeIntelligence({
      capabilityId: "capability.raxode.codeIntelligence",
      languages: ["typescript", "javascript", "json", "markdown"],
      required: false,
      reason: "Expose optional LSP/code intelligence readiness for coding workflows.",
      metadata: {
        toolProfile: "agentCore",
      },
    }),
    praxis.capability.mcp({
      capabilityId: "capability.raxode.mcp",
      required: false,
      reason: "Reserve the MCP bridge for external tools without making it mandatory.",
      metadata: {
        bridge: "passive",
      },
    }),
    praxis.dependency.binary("node", {
      required: true,
      acceptedVersions: [">=22.22.3"],
      install: "manual",
      reason: "Run Praxis, the application backend, and the Ink TUI.",
      metadata: {
        source: "raxode-backend",
      },
    }),
    praxis.dependency.npm("tsx", {
      required: true,
      install: "auto",
      reason: "Launch TypeScript backend/TUI entrypoints during development.",
      metadata: {
        source: "raxode-backend",
      },
    }),
    praxis.dependency.binary("bwrap", {
      required: options.sandboxProfile === "linuxBubblewrap",
      install: "manual",
      reason: "Prepare the Linux bubblewrap sandbox provider; Praxis degrades to workspace rollback when it is unavailable.",
      metadata: {
        source: "raxode-sandbox",
        providerFamily: "linux-bubblewrap",
        defaultWithSandbox: true,
        installHint: "Install bubblewrap with the OS package manager, for example apt install bubblewrap.",
      },
    }),
    praxis.dependency.secretRef("provider.core.main", {
      required: false,
      install: "disabled",
      reason: "Allow the auth plane to resolve provider credentials for live model calls.",
      metadata: {
        roleId: "core.main",
        secretOwner: "runtime.authPlane",
      },
    }),
  ]);
}
