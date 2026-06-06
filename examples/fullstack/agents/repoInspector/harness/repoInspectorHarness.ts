import { praxis } from "@praxis-ai/praxis";
import type { HarnessSpec } from "@praxis-ai/praxis";

import type { NormalizedRepoInspectorOptions } from "../config/repoInspectorOptions.js";
import { createRepoInspectorToolSet } from "../tools/toolSet.js";

const repoInspectorSkillModule = praxis.skill.module({
  sources: [
    praxis.skill.inline([{
      skillId: "repo-review.findings-first",
      title: "Findings First Review",
      summary: "Lead with actionable findings and put summaries after risks.",
      scope: "project",
      whenToUse: "Code review and regression-risk tasks",
      pitfallsPreview: ["Do not bury test gaps in a summary."],
    }, {
      skillId: "repo-inspection.anchor-current-target",
      title: "Anchor Current Target",
      summary: "Restate the current repository/path/task before inspecting or editing.",
      scope: "project",
      whenToUse: "Long context or task-switching sessions",
      pitfallsPreview: ["Do not continue a previous repository by inertia."],
    }]),
  ],
});

export function createRepoInspectorHarness(options: NormalizedRepoInspectorOptions): HarnessSpec {
  return praxis.harness({
    modelRef: `model.repoInspector.${options.mode}`,
    modelFleetRef: "modelFleet.repoInspector.auto",
    promptPackRef: "prompt.example.repoInspector",
    toolPolicyRef: `toolPolicy.example.repoInspector.${options.policyProfile}`,
    mainLoopRef: options.mode === "deep" ? "mainLoop.repoInspector.deep" : "mainLoop.repoInspector.quick",
    sandboxRef: options.sandboxProfile === "linuxBubblewrap"
      ? "sandbox.linuxBubblewrap"
      : options.sandboxProfile === "workspaceOnly"
        ? "sandbox.workspaceOnly"
        : "sandbox.hostObserved",
    storageRef: options.persistence === "sqlite" ? "storage.raxWorkspace.repoInspector" : "storage.memory.repoInspector",
    sessionRef: options.persistence === "sqlite" ? "session.sqlite.repoInspector" : "session.memory.repoInspector",
    statePlaneRef: "statePlane.repoInspector.control",
    interfaceRefs: [
      "interface.repoInspector.approval",
      "interface.repoInspector.events",
      "interface.repoInspector.debug",
    ],
    contextRefs: [
      "context.example.fullstack.cmpBridge.contract",
    ],
    memoryRefs: [
      "memory.example.fullstack.mpBridge.contract",
    ],
    modules: {
      skill: repoInspectorSkillModule,
    },
    tools: praxis.tools(createRepoInspectorToolSet(options)),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "promptPack.define", "tool.execute", "dependency.prepare"],
    }),
    loop: praxis.loop.standard({
      maxModelTurns: options.mode === "deep" ? 4 : 2,
      maxToolCalls: options.mode === "deep" ? 6 : 2,
    }),
  });
}
