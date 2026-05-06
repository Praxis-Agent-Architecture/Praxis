import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
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

  assert.equal(plan.directories.includes("interfaces"), true);
  assert.equal(plan.directories.includes("config"), true);
  assert.equal(plan.directories.includes(".rax_workspace/approvals"), true);
  assert.equal(plan.directories.includes(".rax_workspace/sandbox"), true);
  assert.equal(plan.files.some((file) => file.path === "interfaces/interfaceSurface.md"), true);
  assert.equal(plan.files.some((file) => file.path === "config/modelFleet.ts"), true);
  assert.equal(plan.files.some((file) => file.path === "state/statePlane.ts"), true);
  const agent = plan.files.find((file) => file.path === "agents/mainAgent.ts")?.content ?? "";
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
  const agent = plan.files.find((file) => file.path === "agents/mainAgent.ts")?.content ?? "";
  assert.match(agent, /praxis\.sandbox\.workspaceOnly\(\)/);
  assert.match(agent, /praxis\.toolPolicies\.restricted\(\)/);
  const sandboxProfile = plan.files.find((file) => file.path === "sandbox/profile.ts")?.content ?? "";
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
