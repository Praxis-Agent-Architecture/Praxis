import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createAgentCoreRaxodeBackend } from "../../raxode-cli/index.js";

test("raxode application use case enters agentCore through public runtime API", async () => {
  const backend = createAgentCoreRaxodeBackend({ now: () => "2026-05-09T00:00:00.000Z" });
  const result = await backend.run({
    kind: "run-agent",
    agentPath: "realtest/minimal",
    task: "请用 dry-run 方式证明 raxode application surface 可以接入 agentCore。",
    mode: "dry-run",
    sessionId: "session.raxode.test.minimal",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.backend, "agentCore");
  assert.equal(result.view.agentId, "agent.realtest.minimal.repoInspector");
  assert.equal(result.view.sessionId, "session.raxode.test.minimal");
  assert.equal(result.view.counters.envelopes, 2);
  assert.equal(result.view.counters.catalogTools, 175);
  assert.equal(result.view.backendCapability.backend, "agentCore");
  assert.deepEqual(result.events.map((event) => event.status), ["running", "running", "completed"]);
  assert.equal(result.view.status, "completed");
  assert.equal(result.view.counters.mainLoopSteps > 0, true);
});

test("raxode backend defaults to coding-full caonima capability surface", async () => {
  const backend = createAgentCoreRaxodeBackend({ now: () => "2026-05-09T00:00:00.000Z" });
  const capability = await backend.describe();
  assert.equal(capability.profile, "coding-full");
  assert.equal(capability.defaultAgentPath, "realtest/caonima");
  assert.equal(capability.toolCatalog.total, 175);

  const result = await backend.run({
    kind: "run-agent",
    mode: "dry-run",
    sessionId: "session.raxode.test.caonima",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.view.agentId, "agent.realtest.caonima.proof.bapr");
  assert.equal(result.view.backendCapability.profile, "coding-full");
  assert.equal(result.view.counters.mountedTools, 175);
  assert.equal(result.view.events.some((event) => event.kind === "capability"), true);
});

test("raxode frontend shell stays detached from backend and agentCore imports", async () => {
  const frontend = await readFile(path.resolve("raxode-cli/frontend/tuiShell.ts"), "utf8");
  const contracts = await readFile(path.resolve("raxode-cli/contracts.ts"), "utf8");

  assert.equal(frontend.includes("../backend/"), false);
  assert.equal(frontend.includes("src/agentCore"), false);
  assert.equal(frontend.includes("praxis"), false);
  assert.equal(contracts.includes("src/agentCore"), false);
  assert.equal(contracts.includes("ink"), false);
  assert.equal(contracts.includes("react"), false);
});
