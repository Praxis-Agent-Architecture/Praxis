import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createApplicationProjectRuntime,
  createApplicationRestServer,
} from "../../src/applicationLayer/index.js";
import { runRaxCli } from "../../src/rax_packageManager/raxCli.js";

const REPO_ROOT = path.resolve(new URL("../..", import.meta.url).pathname);
const DOCTOR_PROJECT = path.join(REPO_ROOT, "src/devdoctor");

test("rax devdoctor runs a local applicationLayer backend and records artifacts", async () => {
  const devdoctorDir = await mkdtemp(path.join(os.tmpdir(), "praxis-devdoctor-"));
  const result = await runRaxCli([
    "devdoctor",
    "run",
    "--project",
    DOCTOR_PROJECT,
    "--devdoctor-dir",
    devdoctorDir,
    "--prompt",
    "Reply exactly: DEVDOCTOR_TEST",
    "--json",
  ]);

  assert.equal(result.exitCode, 0);
  const diagnosis = JSON.parse(result.output) as {
    status?: string;
    runDir?: string;
    summary?: { controls?: number; events?: number; errors?: number };
    finalView?: { applicationId?: string; projectId?: string; mountedTools?: number };
  };
  assert.equal(diagnosis.status, "passed");
  assert.equal(diagnosis.finalView?.applicationId, "application.praxis.doctor");
  assert.equal(diagnosis.finalView?.projectId, "praxis.doctor");
  assert.equal((diagnosis.finalView?.mountedTools ?? 0) > 0, true);
  assert.equal((diagnosis.summary?.controls ?? 0) >= 3, true);
  assert.equal((diagnosis.summary?.events ?? 0) > 0, true);
  assert.equal(diagnosis.summary?.errors, 0);

  const report = await runRaxCli([
    "devdoctor",
    "report",
    "--run",
    "latest",
    "--devdoctor-dir",
    devdoctorDir,
  ]);
  assert.equal(report.exitCode, 0);
  assert.match(report.output, /Devdoctor passed/);
  assert.match(report.output, /application\.praxis\.doctor/);

  const cacheXray = await runRaxCli([
    "devdoctor",
    "cache-xray",
    "--run",
    diagnosis.runDir ?? "latest",
    "--devdoctor-dir",
    devdoctorDir,
  ]);
  assert.equal(cacheXray.exitCode, 0);
  assert.match(cacheXray.output, /Cache xray:/);

  const monitor = await runRaxCli([
    "devdoctor",
    "monitor",
    "--run",
    "latest",
    "--devdoctor-dir",
    devdoctorDir,
  ]);
  assert.equal(monitor.exitCode, 0);
  assert.match(monitor.output, /Execution monitor:/);
  assert.match(monitor.output, /Weighted cache hit:/);
});

test("rax devdoctor can attach to an existing REST applicationLayer backend", async () => {
  const created = await createApplicationProjectRuntime(DOCTOR_PROJECT, {
    now: () => "2026-05-10T00:00:00.000Z",
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const server = await createApplicationRestServer(created.runtime);
  const devdoctorDir = await mkdtemp(path.join(os.tmpdir(), "praxis-devdoctor-rest-"));
  try {
    const result = await runRaxCli([
      "devdoctor",
      "run",
      "--backend",
      "rest",
      "--url",
      server.url,
      "--devdoctor-dir",
      devdoctorDir,
      "--prompt",
      "Reply exactly: DEVDOCTOR_REST_TEST",
      "--json",
    ]);
    assert.equal(result.exitCode, 0);
    const diagnosis = JSON.parse(result.output) as {
      status?: string;
      backendKind?: string;
      finalView?: { applicationId?: string; projectId?: string };
    };
    assert.equal(diagnosis.status, "passed");
    assert.equal(diagnosis.backendKind, "rest");
    assert.equal(diagnosis.finalView?.applicationId, "application.praxis.doctor");
    assert.equal(diagnosis.finalView?.projectId, "praxis.doctor");
  } finally {
    await server.close();
  }
});
