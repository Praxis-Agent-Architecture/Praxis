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
} from "../../../../src/runtimeImplementation/runtime.storagePlane/storagePlaneRuntime.js";

test("resolveRaxHome defaults to ~/.rax without creating directories", () => {
  const result = resolveRaxHome({ homeDir: "/tmp/praxis-home" });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.root, "/tmp/praxis-home/.rax");
  assert.equal(result.value.source, "env");
});

test("resolveRaxHome supports Praxis/Rax env overrides for application-owned homes", () => {
  const praxisHome = resolveRaxHome({
    env: { PRAXIS_HOME: "/tmp/praxis-custom-home", RAX_HOME: "/tmp/rax-compat-home" },
    homeDir: "/tmp/ignored",
  });
  assert.equal(praxisHome.ok, true);
  if (praxisHome.ok) {
    assert.equal(praxisHome.value.root, "/tmp/praxis-custom-home");
    assert.equal(praxisHome.value.source, "env");
  }

  const raxHome = resolveRaxHome({
    env: { RAX_HOME: "/tmp/rax-compat-home" },
    homeDir: "/tmp/ignored",
  });
  assert.equal(raxHome.ok, true);
  if (raxHome.ok) {
    assert.equal(raxHome.value.root, "/tmp/rax-compat-home");
    assert.equal(raxHome.value.source, "env");
  }
});

test("resolveRaxHome ignores blank env overrides before falling back", () => {
  const raxHome = resolveRaxHome({
    env: { PRAXIS_HOME: "", RAX_HOME: "/tmp/rax-fallback-home" },
    homeDir: "/tmp/ignored",
  });
  assert.equal(raxHome.ok, true);
  if (raxHome.ok) {
    assert.equal(raxHome.value.root, "/tmp/rax-fallback-home");
    assert.equal(raxHome.value.source, "env");
  }

  const homeDir = resolveRaxHome({
    env: { PRAXIS_HOME: "", RAX_HOME: "", HOME: "" },
    homeDir: "/tmp/praxis-home-fallback",
  });
  assert.equal(homeDir.ok, true);
  if (homeDir.ok) {
    assert.equal(homeDir.value.root, "/tmp/praxis-home-fallback/.rax");
    assert.equal(homeDir.value.source, "env");
  }
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
  assert.equal(ok.runtime.layout.home.toolDeps, "/tmp/praxis-home/.rax/tool-deps");
  assert.equal(ok.runtime.layout.home.toolDepsState, "/tmp/praxis-home/.rax/tool-deps/state.json");
  assert.equal(ok.runtime.layout.workspace.dependencyConfig, path.join(cwd, ".rax_workspace", "config", "dependencies.json"));
  assert.equal(ok.runtime.layout.workspace.dependencyLock, path.join(cwd, ".rax_workspace", "config", "dependency-lock.json"));
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

test("createStoragePlaneRuntime lets applications choose a workspace folder name", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "praxis-storage-app-workspace-"));
  const result = createStoragePlaneRuntime({
    cwd,
    homeDir: "/tmp/praxis-home",
    workspaceFolderName: ".praxis",
    agentId: "agent.app",
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.runtime.workspace.root, path.join(cwd, ".praxis"));
  assert.equal(result.runtime.layout.workspace.dependencyLock, path.join(cwd, ".praxis", "config", "dependency-lock.json"));
});

test("createStoragePlaneRuntime rejects workspace folder names that escape cwd", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "praxis-storage-unsafe-workspace-"));
  const result = createStoragePlaneRuntime({
    cwd,
    homeDir: "/tmp/praxis-home",
    workspaceFolderName: "../outside",
  });

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "INVALID_WORKSPACE_FOLDER_NAME");
  assert.equal(result.error.boundary, "security");
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
