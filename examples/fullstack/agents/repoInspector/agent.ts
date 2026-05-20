import { praxis } from "@praxis-ai/praxis";
import type {
  AgentIdentity,
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

import { createRepoInspectorIdentity } from "./config/identity.js";
import { createRepoInspectorModel, createRepoInspectorModelFleet } from "./config/modelPlane.js";
import {
  normalizeRepoInspectorOptions,
  type RepoInspectorOptions,
} from "./config/repoInspectorOptions.js";
import { createRepoInspectorHarness } from "./harness/repoInspectorHarness.js";
import { createRepoInspectorMainLoop } from "./mainLoop/repoInspectorMainLoop.js";
import { createRepoInspectorToolPolicy } from "./policies/toolPolicy.js";
import { RepoInspectorPrompt } from "./prompts/repoInspectorPrompt.js";
import { createRepoInspectorSandbox } from "./sandbox/profile.js";
import { createRepoInspectorStatePlane } from "./state/statePlane.js";
import { createRepoInspectorSession, createRepoInspectorStorage } from "./storage/storagePolicy.js";

export class RepoInspectorAgent extends praxis.AgentArchetype {
  identity: AgentIdentity;
  model: ModelSpec;
  modelFleet: ModelFleetSpec;
  promptPack: RepoInspectorPrompt;
  mainLoop: MainLoopSpec;
  storage: StorageSpec;
  sandbox: SandboxSpec;
  toolPolicy: BaseToolPolicyMatrixSpec;
  session: SessionSpec;
  statePlane: StatePlaneSpec;
  harness: HarnessSpec;

  constructor(options: RepoInspectorOptions = {}) {
    super();
    const normalized = normalizeRepoInspectorOptions(options);

    this.identity = createRepoInspectorIdentity(normalized);
    this.model = createRepoInspectorModel(normalized);
    this.modelFleet = createRepoInspectorModelFleet(normalized);
    this.promptPack = new RepoInspectorPrompt();
    this.mainLoop = createRepoInspectorMainLoop(normalized);
    this.sandbox = createRepoInspectorSandbox(normalized);
    this.toolPolicy = createRepoInspectorToolPolicy(normalized.policyProfile);
    this.storage = createRepoInspectorStorage(normalized);
    this.session = createRepoInspectorSession(normalized);
    this.statePlane = createRepoInspectorStatePlane();
    this.harness = createRepoInspectorHarness(normalized);
  }
}

export class DeepPermissiveRepoInspectorAgent extends RepoInspectorAgent {
  constructor(options: Pick<RepoInspectorOptions, "persistence" | "sandboxProfile"> = {}) {
    super({
      mode: "deep",
      policyProfile: "permissive",
      includeShell: true,
      includeSkillAuthoring: true,
      persistence: options.persistence,
      sandboxProfile: options.sandboxProfile,
    });
  }
}
