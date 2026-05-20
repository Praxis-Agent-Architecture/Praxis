import assert from "node:assert/strict";
import { mkdir, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createAndApplyStoragePlaneRuntime,
  createStoragePlaneRuntime,
  resolveRaxHome,
  resolveRaxWorkspace,
} from "../../../../src/agentCore_runtimeImplementation/runtime.storagePlane/storagePlaneRuntime.js";

test("resolveRaxHome defaults to ~/.rax without creating directories", () => {
  const result = resolveRaxHome({ homeDir: "/tmp/praxis-home" });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.root, "/tmp/praxis-home/.rax");
  assert.equal(result.value.source, "env");
});

test("resolveRaxWorkspace plans cwd/.rax_workspace when none exists", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "praxis-storage-workspace-"));
  const result = resolveRaxWorkspace({ cwd });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.root, path.join(cwd, ".rax_workspace"));
  assert.equal(result.value.source, "planned");
  assert.equal(result.value.existing, false);
});

test("resolveRaxWorkspace discovers an existing parent .rax_workspace", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "praxis-storage-discover-"));
  await mkdir(path.join(root, ".rax_workspace"));
  const nested = path.join(root, "packages", "agent");
  await mkdir(nested, { recursive: true });

  const result = resolveRaxWorkspace({ cwd: nested });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.root, path.join(root, ".rax_workspace"));
  assert.equal(result.value.source, "discovered");
  assert.equal(result.value.existing, true);
});

test("createStoragePlaneRuntime creates layout and rejects unsafe agent ids", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "praxis-storage-layout-"));
  const ok = createStoragePlaneRuntime({
    cwd,
    homeDir: "/tmp/praxis-home",
    agentId: "agent.coding",
  });

  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.equal(ok.runtime.layout.workspace.sessionSqlitePath, path.join(cwd, ".rax_workspace", "sessions", "praxis.sqlite"));
  assert.equal(ok.runtime.layout.workspace.agent?.root, path.join(cwd, ".rax_workspace", "agents", "agent.coding"));
  assert.equal(ok.runtime.initPlan.writesSecrets, false);

  const bad = createStoragePlaneRuntime({
    cwd,
    homeDir: "/tmp/praxis-home",
    agentId: "../escape",
  });
  assert.equal(bad.ok, false);
  if (bad.ok) return;
  assert.equal(bad.error.code, "INVALID_AGENT_ID");
});

test("createAndApplyStoragePlaneRuntime applies the init plan without files or secrets", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "praxis-storage-apply-"));
  const result = await createAndApplyStoragePlaneRuntime({
    cwd,
    homeDir: path.join(cwd, "home"),
    agentId: "agent.apply",
    initMode: "on-run",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.runtime.initPlan.createsFiles, false);
  assert.equal(result.runtime.initPlan.writesSecrets, false);
  assert.ok(result.init.createdDirectories.includes(path.join(cwd, ".rax_workspace", "sessions")));
});
