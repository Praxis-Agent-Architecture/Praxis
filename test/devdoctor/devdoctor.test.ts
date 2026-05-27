import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createApplicationProjectRuntime, createApplicationRestServer, createApplicationWebSocketServer } from "../../src/applicationLayer/index.js";
import { runDevDoctor } from "../../src/devdoctor/index.js";

test("devdoctor runs a local application project and records inspectable artifacts", async () => {
  const devdoctorDir = await mkdtemp(path.join(os.tmpdir(), "praxis-devdoctor-"));
  const run = await runDevDoctor([
    "run",
    "--prompt",
    "Reply exactly: DEVDOCTOR_OK",
    "--dry-run",
    "--devdoctor-dir",
    devdoctorDir,
    "--json",
  ]);
  assert.equal(run.exitCode, 0);
  const diagnosis = JSON.parse(run.output) as { status: string; runDir: string; summary: { controls: number; views: number } };
  assert.equal(diagnosis.status, "passed");
  assert.ok(diagnosis.runDir.startsWith(path.join(devdoctorDir, "runs")));
  assert.ok(diagnosis.summary.controls >= 3);
  assert.ok(diagnosis.summary.views >= 3);

  const inspect = await runDevDoctor(["inspect", "--run", diagnosis.runDir, "--json"]);
  assert.equal(inspect.exitCode, 0);
  const inspected = JSON.parse(inspect.output) as { status: string; finalView?: { applicationId: string; mountedTools: number } };
  assert.equal(inspected.status, "passed");
  assert.equal(inspected.finalView?.applicationId, "application.praxis.doctor");
  assert.ok((inspected.finalView?.mountedTools ?? 0) > 0);

  const cacheXray = await runDevDoctor(["cache-xray", "--run", diagnosis.runDir, "--json"]);
  assert.equal(cacheXray.exitCode, 0);
  const cacheReport = JSON.parse(cacheXray.output) as { status: string; runDir: string; cache?: { cacheTelemetryCoverage: number } };
  assert.equal(cacheReport.runDir, diagnosis.runDir);
  assert.ok(cacheReport.status.length > 0);

  const monitor = await runDevDoctor(["monitor", "--run", diagnosis.runDir, "--json"]);
  assert.equal(monitor.exitCode, 0);
  const monitorReport = JSON.parse(monitor.output) as {
    kind: string;
    source: { runDir: string };
    sessions: unknown[];
    project: { usage: { modelCalls: number }; health: { sessionsAnalyzed: number } };
  };
  assert.equal(monitorReport.kind, "praxis.executionMonitor.report");
  assert.equal(monitorReport.source.runDir, diagnosis.runDir);
  assert.ok(monitorReport.sessions.length > 0);
  assert.ok(monitorReport.project.usage.modelCalls > 0);

  const latestMonitor = await runDevDoctor(["monitor", "--devdoctor-dir", devdoctorDir, "--json"]);
  assert.equal(latestMonitor.exitCode, 0);
  const latestMonitorReport = JSON.parse(latestMonitor.output) as { source: { runDir: string } };
  assert.equal(latestMonitorReport.source.runDir, diagnosis.runDir);

  const tools = await runDevDoctor(["tools", "--run", diagnosis.runDir, "--json"]);
  assert.equal(tools.exitCode, 0);
  const toolReport = JSON.parse(tools.output) as { mounted: number; total: number; mountedToolIds: string[] };
  assert.equal(toolReport.mounted, 2);
  assert.ok(toolReport.total > 0);
  assert.ok(toolReport.mountedToolIds.includes("file.read"));

  const logs = await runDevDoctor(["logs", "--run", diagnosis.runDir, "--json"]);
  assert.equal(logs.exitCode, 0);
  const logReport = JSON.parse(logs.output) as { controls: number; events: number; errors: number; eventKinds: Record<string, number> };
  assert.ok(logReport.controls >= 3);
  assert.ok(logReport.events > 0);
  assert.equal(logReport.errors, 0);
  assert.ok((logReport.eventKinds.model ?? 0) > 0);

  const compat = await runDevDoctor(["compat", "--run", diagnosis.runDir, "--json"]);
  assert.equal(compat.exitCode, 0);
  const compatReport = JSON.parse(compat.output) as { status: string; checks: { id: string; ok: boolean }[] };
  assert.equal(compatReport.status, "compatible");
  assert.equal(compatReport.checks.every((check) => check.ok), true);

  await readFile(path.join(diagnosis.runDir, "tool-inspector.json"), "utf8");
  await readFile(path.join(diagnosis.runDir, "log-inspector.json"), "utf8");
  await readFile(path.join(diagnosis.runDir, "compatibility.json"), "utf8");
  await readFile(path.join(diagnosis.runDir, "execution-monitor.json"), "utf8");
  await readFile(path.join(diagnosis.runDir, "execution-monitor.md"), "utf8");
});

test("devdoctor can diagnose a standard applicationLayer REST backend", async () => {
  const devdoctorDir = await mkdtemp(path.join(os.tmpdir(), "praxis-devdoctor-rest-"));
  const created = await createApplicationProjectRuntime("src/devdoctor", {
    now: () => new Date().toISOString(),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const server = await createApplicationRestServer(created.runtime);
  try {
    const run = await runDevDoctor([
      "run",
      "--backend",
      "rest",
      "--url",
      server.url,
      "--prompt",
      "Reply exactly: DEVDOCTOR_OK",
      "--dry-run",
      "--devdoctor-dir",
      devdoctorDir,
      "--json",
    ]);
    assert.equal(run.exitCode, 0);
    const diagnosis = JSON.parse(run.output) as { status: string; runDir: string; backendKind?: string; finalView?: { applicationId: string } };
    assert.equal(diagnosis.status, "passed");
    assert.equal(diagnosis.backendKind, "rest");
    assert.equal(diagnosis.finalView?.applicationId, "application.praxis.doctor");
    const logs = await runDevDoctor(["logs", "--run", diagnosis.runDir, "--json"]);
    assert.equal(logs.exitCode, 0);
    const logReport = JSON.parse(logs.output) as { events: number };
    assert.ok(logReport.events > 0);
  } finally {
    await server.close();
  }
});

test("devdoctor can diagnose a standard applicationLayer WebSocket backend", async () => {
  const devdoctorDir = await mkdtemp(path.join(os.tmpdir(), "praxis-devdoctor-ws-"));
  const created = await createApplicationProjectRuntime("src/devdoctor", {
    now: () => new Date().toISOString(),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const server = await createApplicationWebSocketServer(created.runtime);
  try {
    const run = await runDevDoctor([
      "run",
      "--backend",
      "websocket",
      "--url",
      server.url,
      "--prompt",
      "Reply exactly: DEVDOCTOR_OK",
      "--dry-run",
      "--devdoctor-dir",
      devdoctorDir,
      "--json",
    ]);
    assert.equal(run.exitCode, 0);
    const diagnosis = JSON.parse(run.output) as { status: string; backendKind?: string; finalView?: { applicationId: string } };
    assert.equal(diagnosis.status, "passed");
    assert.equal(diagnosis.backendKind, "websocket");
    assert.equal(diagnosis.finalView?.applicationId, "application.praxis.doctor");
  } finally {
    await server.close();
  }
});

test("devdoctor init writes reusable local and rest profiles", async () => {
  const devdoctorDir = await mkdtemp(path.join(os.tmpdir(), "praxis-devdoctor-init-"));
  const init = await runDevDoctor(["init", "--devdoctor-dir", devdoctorDir, "--json"]);
  assert.equal(init.exitCode, 0);
  const result = JSON.parse(init.output) as { path: string; wrote: boolean; config: { profiles: Record<string, unknown> } };
  assert.equal(result.wrote, true);
  assert.ok(result.config.profiles["local-doctor"]);
  assert.ok(result.config.profiles["rest-template"]);
  assert.ok(result.config.profiles["websocket-template"]);

  const second = await runDevDoctor(["init", "--devdoctor-dir", devdoctorDir, "--json"]);
  const secondResult = JSON.parse(second.output) as { wrote: boolean };
  assert.equal(secondResult.wrote, false);
});
