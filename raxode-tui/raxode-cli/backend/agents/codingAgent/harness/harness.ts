import { praxis } from "@praxis-ai/praxis";
import type { HarnessSpec } from "@praxis-ai/praxis";

import type { NormalizedRaxodeOptions } from "../config/raxodeOptions.js";
import { createRaxodeToolSet } from "../tools/toolSet.js";

export function createRaxodeHarness(options: NormalizedRaxodeOptions): HarnessSpec {
  return praxis.harness({
    modelRef: "model.raxode.coding.primary",
    modelFleetRef: "modelFleet.raxode.auto",
    promptPackRef: "prompt.raxode.coding",
    toolPolicyRef: `toolPolicy.raxode.${options.policyProfile}`,
    mainLoopRef: "mainLoop.raxode.coding",
    sandboxRef: options.sandboxProfile === "hostObserved"
      ? "sandbox.hostObserved"
      : options.sandboxProfile === "workspaceOnly"
        ? "sandbox.workspaceOnly"
        : "sandbox.linuxBubblewrap",
    storageRef: options.persistence === "sqlite" ? "storage.raxode.workspace" : "storage.raxode.memory",
    sessionRef: options.persistence === "sqlite" ? "session.raxode.sqlite" : "session.raxode.memory",
    statePlaneRef: "statePlane.raxode.control",
    interfaceRefs: [
      "interface.raxode.tui",
      "interface.raxode.approval",
      "interface.raxode.events",
      "interface.raxode.management",
      "interface.raxode.repair",
    ],
    contextRefs: [
      "context.raxode.praxisContextBridge",
      "context.raxode.workspace",
      "context.praxis.passiveContext",
    ],
    context: {
      refs: [
        "context.raxode.workspace",
        "context.praxis.passiveContext",
        "context.praxis.promptPack",
      ],
      metadata: {
        mode: "passive-first",
        projectContext: "application-managed",
        artifactBridge: "context.load",
      },
    },
    memoryRefs: [
      "memory.raxode.praxisMemoryBridge",
      "memory.raxode.artifactIndex",
      "memory.praxis.passiveMemory",
    ],
    memory: {
      mode: "session",
      pool: "memory.praxis.passiveMemory",
      metadata: {
        strategy: "passive-session-first",
        longTermMemory: "optional",
        artifactIndex: "application-managed",
      },
    },
    tools: praxis.tools(createRaxodeToolSet(options)),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: [
        "agent.invoke",
        "manifest.inspect",
        "promptPack.define",
        "tool.execute",
        "dependency.prepare",
        "storage.init",
        "session.persist",
        "state.control",
        "application.control",
      ],
    }),
    loop: praxis.loop.standard({
      maxModelTurns: 4096,
      maxToolCalls: 4096,
    }),
    modules: {
      dependencyPlane: { mode: "prepare-declared-capabilities" },
      authPlane: { mode: "provider-profile-resolver", roleId: "core.main" },
      projectPlane: { mode: "application-project-runtime" },
      sessionPlane: { mode: options.persistence === "sqlite" ? "durable" : "memory" },
      contextPlane: { mode: "passive" },
      memoryPlane: { mode: options.memoryProfile },
      cachePlane: { mode: "prompt-pack-cache-xray" },
      multiagentPlane: { mode: "contract-ready" },
    },
    runtimeRequirements: [
      "praxis.applicationLayer",
      "praxis.basetool.agentCore",
      "praxis.promptPack.core123",
      "praxis.authPlane.providerProfiles",
      "praxis.projectSession.runtime",
      "praxis.sandboxPlane.declaredCapabilities",
      "praxis.cachePlane.promptPackXray",
      "praxis.multiagent.contract",
    ],
    metadata: {
      product: "raxode",
      toolProfile: "agentCore",
      policyProfile: options.policyProfile,
      sandboxProfile: options.sandboxProfile,
      applicationInstructions: "The backend is a Praxis application-layer harness, not a private runtime shortcut.",
      harnessInstructions: "Preserve OAO declarations; keep provider auth, project/session, context/memory, sandbox, cache, and multiagent concerns routed through Praxis runtime surfaces.",
    },
  });
}
