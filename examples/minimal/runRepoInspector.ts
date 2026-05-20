import { praxis } from "@praxis-ai/praxis";
import { MinimalRepoInspectorAgent } from "./repoInspectorAgent.js";

/*
 * Minimal runner 目标：
 * 展示最短主链：Agent object -> compileAgent -> inspect -> runManifest。
 *
 * 不做 fullstack 那种 readiness 大报告。
 * 白话：这里用于回答“一个普通开发者到底怎么开始写”。
 */

const agent = new MinimalRepoInspectorAgent();

/*
 * compileAgent：开发者写 OO class/object，runtime truth 是 AgentManifest。
 */
const compiled = praxis.compileAgent(agent, {
  compiledAt: "2026-05-06T00:00:00.000Z",
});

if (!compiled.ok) {
  console.error("compile failed:", compiled.error);
  process.exit(1);
}

/*
 * inspectAgentManifest：快速看 manifest 是否包含 identity/model/harness/prompt/sandbox。
 */
const inspection = praxis.inspectAgentManifest(compiled.manifest);

console.log("=== Minimal Agent ===");
console.log({
  manifestId: compiled.manifest.manifestId,
  hash: compiled.manifest.manifestHash,
  identity: compiled.manifest.identity,
  model: compiled.manifest.model,
  promptPack: compiled.manifest.promptPack.promptPackId,
  sandbox: compiled.manifest.sandbox.profile,
  toolPolicy: compiled.manifest.toolPolicy.profile,
  tools: compiled.manifest.harness.tools.map((tool) => tool.toolId),
  frameworkCore: inspection.frameworkCore,
});

/*
 * runManifest：正式运行入口。
 * dryRun=true 表示不真实调模型；但 session、promptPack、mainLoop step、output exposure 都会走。
 */
const runtime = praxis.runtime.createPraxisRuntimeKernel({
  runtimeId: "runtime.example.minimal",
});

const result = await runtime.runManifest(
  compiled.manifest,
  "请用只读方式观察当前仓库，并说明 minimal agent 是否已经能启动。",
  {
    sessionId: "session.example.minimal.repoInspector",
    dryRun: true,
    storage: {
      cwd: process.cwd(),
      initMode: "never",
    },
    now: () => "2026-05-06T00:00:00.000Z",
  },
);

console.log("\n=== Minimal Runtime Result ===");
console.log(result.ok
  ? {
      ok: true,
      finalOutput: result.finalOutput,
      modelCalls: result.modelCalls.length,
      toolCalls: result.toolCalls.length,
      mainLoopSteps: result.mainLoopSteps.map((step) => `${step.stepIndex}:${step.actionPrimitive}:${step.status}`),
      cachePlanSteps: result.mainLoopSteps
        .filter((step) => step.actionPrimitive === "buildCachePlan" && step.status === "completed")
        .map((step) => ({
          stepId: step.stepId,
          cacheablePrefixSegmentKinds: step.metadata.cacheablePrefixSegmentKinds,
          cacheRiskWarnings: step.metadata.cacheRiskWarnings,
        })),
      eventCount: result.events.length,
    }
  : {
      ok: false,
      error: result.error,
      events: result.events,
    });
