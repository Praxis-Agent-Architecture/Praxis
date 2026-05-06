import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  createRaxBuildInitPlan,
  initRaxProject,
} from "../../../src/rax_packageManager/raxBuildInit.js";
import { runRaxCli } from "../../../src/rax_packageManager/raxCli.js";

const scratchRoot = path.join(process.cwd(), "tasks", "tmp", "rax-build-init-test");

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
  assert.match(agentSource, /from "@praxis-ai\/framework"/);
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
    "--git-tools",
    "yes",
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
  assert.match(result.output, /@praxis-ai\/framework/);
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
    ["core-static"],
  );
  assert.ok(payload.readiness?.promptPackPreview?.cachePlan?.dynamicSegmentKinds?.includes("turn-dynamic"));
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
