import assert from "node:assert/strict";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  createRaxBuildInitPlan,
  initRaxProject,
} from "../../../src/rax_packageManager/raxBuildInit.js";
import { runRaxCli } from "../../../src/rax_packageManager/raxCli.js";

const scratchRoot = path.join(process.cwd(), ".tmp", "rax-build-init-test", "work");

test("rax build init minimal creates a runnable public-API project skeleton", async () => {
  const targetDir = path.join(scratchRoot, "minimal");
  await rm(targetDir, { recursive: true, force: true });

  const result = await initRaxProject({
    preset: "minimal",
    projectName: "repo-agent",
    targetDir,
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;

  assert.equal(result.plan.preset, "minimal");
  assert.equal(result.writtenFiles.some((file) => file.endsWith("agents/mainAgent.ts")), true);
  const agentSource = await readFile(path.join(targetDir, "agents/mainAgent.ts"), "utf8");
  assert.match(agentSource, /from "@praxis-ai\/praxis"/);
  assert.match(agentSource, /praxis\.sandbox\.hostObserved\(\)/);
  assert.match(agentSource, /praxis\.toolPolicies\.standard\(\)/);
});

test("rax build init fullstack prepares the mature agent workspace layout", () => {
  const plan = createRaxBuildInitPlan({
    preset: "fullstack",
    projectName: "fullstack-agent",
    targetDir: path.join(scratchRoot, "fullstack"),
    sandboxProfile: "linuxBubblewrap",
    sessionPersistence: "sqlite",
  });

  assert.equal(plan.directories.includes("application"), true);
  assert.equal(plan.directories.includes("agents/mainAgent/interfaces"), true);
  assert.equal(plan.directories.includes("agents/mainAgent/config"), true);
  assert.equal(plan.directories.includes("authentication"), true);
  assert.equal(plan.directories.includes("context"), true);
  assert.equal(plan.directories.includes("memory"), true);
  assert.equal(plan.directories.includes("topology"), true);
  assert.equal(plan.directories.includes(".rax_workspace/approvals"), true);
  assert.equal(plan.directories.includes(".rax_workspace/sandbox"), true);
  assert.equal(plan.files.some((file) => file.path === "agents/mainAgent/interfaces/interfaceSurface.md"), true);
  assert.equal(plan.files.some((file) => file.path === "agents/mainAgent/config/modelFleet.ts"), true);
  assert.equal(plan.files.some((file) => file.path === "agents/mainAgent/state/statePlane.ts"), true);
  const cmpBridge = plan.files.find((file) => file.path === "context/cmpBridge.ts")?.content ?? "";
  assert.match(cmpBridge, /cmpBridgeContract/);
  assert.match(cmpBridge, /context\.fullstack-agent\.cmpBridge\.contract/);
  assert.match(cmpBridge, /不引入独立后台 context pool/);
  const mpBridge = plan.files.find((file) => file.path === "memory/mpBridge.ts")?.content ?? "";
  assert.match(mpBridge, /mpBridgeContract/);
  assert.match(mpBridge, /memory\.fullstack-agent\.mpBridge\.contract/);
  assert.match(mpBridge, /不引入独立后台 memory agent/);
  const tsconfig = plan.files.find((file) => file.path === "tsconfig.json")?.content ?? "";
  assert.match(tsconfig, /application\/\*\*\/\*\.ts/);
  assert.match(tsconfig, /agents\/\*\*\/\*\.ts/);
  assert.match(tsconfig, /authentication\/\*\*\/\*\.ts/);
  assert.match(tsconfig, /context\/\*\*\/\*\.ts/);
  const agent = plan.files.find((file) => file.path === "agents/mainAgent/agent.ts")?.content ?? "";
  assert.match(agent, /praxis\.sandbox\.linuxBubblewrap\(\)/);
  assert.match(agent, /onApprovalRef/);
  assert.match(agent, /"approve"/);
});

test("rax build init custom supports a non-interactive wizard input path", async () => {
  const result = await runRaxCli([
    "build",
    "init",
    "custom",
    "--name",
    "custom-agent",
    "--dir",
    path.join(scratchRoot, "custom"),
    "--model",
    "gpt-5.4",
    "--sandbox",
    "workspaceOnly",
    "--tool-policy",
    "restricted",
    "--session",
    "sqlite",
    "--shell-tools",
    "no",
    "--interface",
    "yes",
    "--dry-run",
  ]);

  assert.equal(result.exitCode, 0);
  const plan = JSON.parse(result.output) as { preset: string; files: { path: string; content: string }[] };
  assert.equal(plan.preset, "custom");
  const agent = plan.files.find((file) => file.path === "agents/mainAgent/agent.ts")?.content ?? "";
  assert.match(agent, /praxis\.sandbox\.workspaceOnly\(\)/);
  assert.match(agent, /praxis\.toolPolicies\.restricted\(\)/);
  const sandboxProfile = plan.files.find((file) => file.path === "agents/mainAgent/sandbox/profile.ts")?.content ?? "";
  assert.match(sandboxProfile, /praxis\.sandbox\.workspaceOnly\(\)/);
});

test("rax help never creates a project by accident", async () => {
  const targetDir = path.join(scratchRoot, "help-should-not-create");
  await rm(targetDir, { recursive: true, force: true });

  const result = await runRaxCli([
    "build",
    "init",
    "minimal",
    "--dir",
    targetDir,
    "--help",
  ]);

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /rax build init minimal\|fullstack\|custom/);
  await assert.rejects(readFile(path.join(targetDir, "package.json"), "utf8"));
});

test("rax inspect console explains missing framework dependency before project install", async () => {
  const targetDir = path.join(scratchRoot, "inspect-console");
  await rm(targetDir, { recursive: true, force: true });
  const created = await initRaxProject({
    preset: "minimal",
    projectName: "inspect-console",
    targetDir,
  });
  assert.equal(created.ok, true);

  const result = await runRaxCli([
    "inspect",
    path.join(targetDir, "agents/mainAgent.ts"),
  ]);

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /self-repair hints:/);
  assert.match(result.output, /npm install/);
  assert.match(result.output, /@praxis-ai\/praxis/);
});

test("rax inspect auto-discovers named Agent exports", async () => {
  const targetDir = path.join(scratchRoot, "named-export");
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  const agentPath = path.join(targetDir, "namedAgent.ts");
  await writeFile(agentPath, [
    "import { praxis } from \"../../../../src/agentCore/index.js\";",
    "export class HelperPrompt extends praxis.PromptPack {}",
    "export class NamedAgent extends praxis.Agent {",
    "  identity = \"agent.named-export\";",
    "  model = praxis.model(\"gpt-5.4\");",
    "  harness = praxis.harness({ loop: praxis.loop.single() });",
    "}",
    "",
  ].join("\n"), "utf8");

  const result = await runRaxCli(["inspect", agentPath, "--json"]);

  assert.equal(result.exitCode, 0);
  assert.match(result.output, /agent\.named-export/);
  const payload = JSON.parse(result.output) as {
    readiness?: {
      promptPackPreview?: {
        cachePlan?: {
          segmentCount?: number;
          cacheablePrefixSegmentKinds?: readonly string[];
          dynamicSegmentKinds?: readonly string[];
        };
      };
    };
  };
  assert.ok((payload.readiness?.promptPackPreview?.cachePlan?.segmentCount ?? 0) > 0);
  assert.deepEqual(
    payload.readiness?.promptPackPreview?.cachePlan?.cacheablePrefixSegmentKinds?.slice(0, 1),
    ["stableSystemCore"],
  );
  assert.ok(payload.readiness?.promptPackPreview?.cachePlan?.dynamicSegmentKinds?.includes("userTurn"));
});

test("rax test executes a runtime dry-run after readiness checks", async () => {
  const targetDir = path.join(scratchRoot, "dry-run-test");
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  const agentPath = path.join(targetDir, "dryRunAgent.ts");
  await writeFile(agentPath, [
    "import { praxis } from \"../../../../src/agentCore/index.js\";",
    "export class DryRunAgent extends praxis.Agent {",
    "  identity = \"agent.dry-run-test\";",
    "  model = praxis.model(\"gpt-5.4\");",
    "  storage = praxis.storage.memory();",
    "  harness = praxis.harness({ loop: praxis.loop.single() });",
    "}",
    "",
  ].join("\n"), "utf8");

  const result = await runRaxCli(["test", agentPath, "--json"]);

  assert.equal(result.exitCode, 0);
  const payload = JSON.parse(result.output) as { runtimeDryRun?: { ok?: boolean; finalOutput?: string } };
  assert.equal(payload.runtimeDryRun?.ok, true);
  assert.equal(payload.runtimeDryRun?.finalOutput, "PraxisRuntimeKernel dry-run completed.");
});

test("rax test attaches a non-intelligent self-repair preflight plan for unavailable runtime surfaces", async () => {
  const targetDir = path.join(scratchRoot, "self-repair-preflight");
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  const agentPath = path.join(targetDir, "selfRepairAgent.ts");
  await writeFile(agentPath, [
    "import { praxis } from \"../../../../src/agentCore/index.js\";",
    "export class SelfRepairAgent extends praxis.Agent {",
    "  identity = \"agent.self-repair-preflight\";",
    "  model = praxis.model(\"gpt-5.4\");",
    "  storage = praxis.storage.memory();",
    "  sandbox = praxis.sandbox.rootlessContainer();",
    "  harness = praxis.harness({ loop: praxis.loop.single() });",
    "}",
    "",
  ].join("\n"), "utf8");

  const result = await runRaxCli(["test", agentPath, "--json"]);

  assert.equal(result.exitCode, 1);
  const payload = JSON.parse(result.output) as {
    selfRepairPreflight?: {
      mode?: string;
      status?: string;
      dryRun?: boolean;
      modelUsed?: boolean;
      unsafeSideEffects?: boolean;
      faults?: { stepSummaries?: readonly string[] }[];
      publicSafeMessages?: readonly string[];
    };
  };
  assert.equal(payload.selfRepairPreflight?.mode, "test-auto-plan");
  assert.equal(payload.selfRepairPreflight?.dryRun, true);
  assert.equal(payload.selfRepairPreflight?.modelUsed, false);
  assert.equal(payload.selfRepairPreflight?.unsafeSideEffects, false);
  assert.ok((payload.selfRepairPreflight?.faults?.length ?? 0) > 0);
  assert.ok((payload.selfRepairPreflight?.publicSafeMessages?.length ?? 0) > 0);
  assert.ok(payload.selfRepairPreflight?.status === "plan-ready" || payload.selfRepairPreflight?.status === "escalated");
});

test("rax inspect reports selected BaseTools through CLI host adapter readiness", async () => {
  const targetDir = path.join(scratchRoot, "basetool-host-readiness");
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  const agentPath = path.join(targetDir, "toolAgent.ts");
  await writeFile(agentPath, [
    "import { praxis } from \"../../../../src/agentCore/index.js\";",
    "export class ToolAgent extends praxis.Agent {",
    "  identity = \"agent.basetool-host-readiness\";",
    "  model = praxis.model(\"gpt-5.5\");",
    "  storage = praxis.storage.memory();",
    "  harness = praxis.harness({",
    "    tools: praxis.tools([",
      "      praxis.basetool.core.fileRead({ profileName: \"codingCore\" }),",
      "      praxis.basetool.core.fileSearch({ profileName: \"codingCore\" }),",
      "      praxis.basetool.core.webFetch({ profileName: \"codingCore\" }),",
      "      praxis.basetool.extension.skillLoad({ profileName: \"codingCore\" }),",
    "    ]),",
    "    loop: praxis.loop.single(),",
    "  });",
    "}",
    "",
  ].join("\n"), "utf8");

  const result = await runRaxCli(["inspect", agentPath, "--json"]);

  assert.equal(result.exitCode, 0);
  const payload = JSON.parse(result.output) as {
    readiness?: {
      toolReadiness?: {
        ready?: number;
        missing?: readonly string[];
        tools?: {
          toolId: string;
          ready?: boolean;
          executorSupport?: string;
          missingPorts?: readonly string[];
        }[];
      };
    };
  };
  const readiness = payload.readiness?.toolReadiness;
  assert.equal(readiness?.ready, 3);
  assert.deepEqual(readiness?.missing, ["skill.load"]);
  for (const tool of readiness?.tools ?? []) {
    if (tool.toolId === "skill.load") {
      assert.equal(tool.ready, false, tool.toolId);
      assert.equal(tool.executorSupport, "adapterRequired", tool.toolId);
      assert.deepEqual(tool.missingPorts, ["skill.load"], tool.toolId);
    } else {
      assert.equal(tool.ready, true, tool.toolId);
      assert.equal(tool.executorSupport, "hostReady", tool.toolId);
      assert.deepEqual(tool.missingPorts, [], tool.toolId);
    }
  }
});

test("rax test --all-testable reports the core BaseTool readiness matrix", async () => {
  const targetDir = path.join(scratchRoot, "all-testable-readiness");
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  const agentPath = path.join(targetDir, "allToolAgent.ts");
  await writeFile(agentPath, [
    "import { praxis } from \"../../../../src/agentCore/index.js\";",
    "export class AllToolAgent extends praxis.Agent {",
    "  identity = \"agent.all-testable-readiness\";",
    "  model = praxis.model(\"gpt-5.5\");",
    "  storage = praxis.storage.memory();",
    "  harness = praxis.harness({",
    "    tools: praxis.tools([praxis.basetool.core.fileRead({ profileName: \"codingCore\" })]),",
    "    loop: praxis.loop.single(),",
    "  });",
    "}",
    "",
  ].join("\n"), "utf8");

  const result = await runRaxCli(["test", agentPath, "--all-testable", "--json"]);

  assert.equal(result.exitCode, 0);
  const payload = JSON.parse(result.output) as {
    readiness?: {
      toolReadiness?: {
        total?: number;
        ready?: number;
        missing?: readonly string[];
        tools?: { toolId: string; ready?: boolean }[];
      };
    };
  };
  assert.equal(payload.readiness?.toolReadiness?.total, 25);
  assert.equal(payload.readiness?.toolReadiness?.ready, 10);
  assert.deepEqual(payload.readiness?.toolReadiness?.missing, [
    "agent.inbox",
    "agent.inspect",
    "agent.kill",
    "agent.list",
    "agent.message",
    "agent.spawn",
    "agent.stop",
    "agent.wait",
    "context.load",
    "mcp.resources",
    "mcp.use",
    "media.viewImage",
    "skill.load",
    "user.ask",
    "web.search",
  ]);
  assert.equal(payload.readiness?.toolReadiness?.tools?.some((tool) => tool.toolId === "mcp.use"), true);
  assert.equal(payload.readiness?.toolReadiness?.tools?.some((tool) => tool.toolId === "tool.describe"), true);
  assert.equal(payload.readiness?.toolReadiness?.tools?.some((tool) => tool.toolId === "agent.spawn"), true);
});

test("rax test can run full dependency preparation for selected core tools", async () => {
  const targetDir = path.join(scratchRoot, "dependency-full");
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  const managedRoot = path.join(targetDir, ".rax_workspace", "tool-deps");
  const binDir = path.join(managedRoot, "bin");
  await mkdir(binDir, { recursive: true });
  const executable = path.join(binDir, "ripgrep");
  await writeFile(executable, "#!/usr/bin/env sh\necho 4.0.0\n", "utf8");
  await chmod(executable, 0o755);

  const agentPath = path.join(targetDir, "dependencyAgent.ts");
  await writeFile(agentPath, [
    "import { praxis } from \"../../../../src/agentCore/index.js\";",
    "export class DependencyAgent extends praxis.Agent {",
    "  identity = \"agent.core-dependency-full\";",
    "  model = praxis.model(\"gpt-5.5\");",
    "  storage = praxis.storage.memory();",
    "  harness = praxis.harness({",
    "    tools: praxis.tools([praxis.basetool.core.fileSearch({ profileName: \"codingCore\" })]),",
    "    loop: praxis.loop.single(),",
    "  });",
    "}",
    "",
  ].join("\n"), "utf8");

  const result = await runRaxCli(["test", agentPath, "--dependency-mode", "full", "--managed-root", managedRoot, "--json"]);

  assert.equal(result.exitCode, 0);
  const payload = JSON.parse(result.output) as {
    dependencyPreparation?: {
      mode?: string;
      total?: number;
      ready?: number;
      blocked?: number;
      results?: { toolId: string; decision: string; status: string }[];
    };
  };
  assert.equal(payload.dependencyPreparation?.mode, "full");
  assert.equal(payload.dependencyPreparation?.total, 1);
  assert.equal(payload.dependencyPreparation?.ready, 1);
  assert.equal(payload.dependencyPreparation?.blocked, 0);
  assert.deepEqual(payload.dependencyPreparation?.results?.map((entry) => [entry.toolId, entry.decision]), [
    ["file.search", "ready"],
  ]);
});

test("rax live mode reports missing Codex auth through public-safe output", async () => {
  const targetDir = path.join(scratchRoot, "live-missing-auth");
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  const agentPath = path.join(targetDir, "liveAgent.ts");
  await writeFile(agentPath, [
    "import { praxis } from \"../../../../src/agentCore/index.js\";",
    "export class LiveAgent extends praxis.Agent {",
    "  identity = \"agent.live-missing-auth\";",
    "  model = praxis.model(\"gpt-5.4\");",
    "  storage = praxis.storage.memory();",
    "  harness = praxis.harness({ loop: praxis.loop.single() });",
    "}",
    "",
  ].join("\n"), "utf8");

  const result = await runRaxCli([
    "run",
    agentPath,
    "--live",
    "--codex-auth-file",
    path.join(targetDir, "missing-auth.json"),
    "hello live",
  ]);

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /live provider is not ready/);
  assert.match(result.output, /provide --codex-auth-file/);
  assert.doesNotMatch(result.output, /Bearer\s+/);
});

test("rax inspect asks for --export when an agent file exports multiple agents", async () => {
  const targetDir = path.join(scratchRoot, "multiple-export");
  await rm(targetDir, { recursive: true, force: true });
  await mkdir(targetDir, { recursive: true });
  const agentPath = path.join(targetDir, "multiAgent.ts");
  await writeFile(agentPath, [
    "import { praxis } from \"../../../../src/agentCore/index.js\";",
    "class Base extends praxis.Agent {",
    "  identity = \"agent.multi.base\";",
    "  model = praxis.model(\"gpt-5.4\");",
    "  harness = praxis.harness({ loop: praxis.loop.single() });",
    "}",
    "export class FirstAgent extends Base {}",
    "export class SecondAgent extends Base { identity = \"agent.multi.second\"; }",
    "",
  ].join("\n"), "utf8");

  const result = await runRaxCli(["inspect", agentPath]);

  assert.equal(result.exitCode, 1);
  assert.match(result.output, /multiple Praxis Agent exports found/);
  assert.match(result.output, /--export/);
});
