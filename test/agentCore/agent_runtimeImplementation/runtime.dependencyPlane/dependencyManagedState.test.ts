import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  writeManagedDependencyRecord,
  writeProjectDependencyLockEntry,
} from "../../../../src/runtimeImplementation/runtime.dependencyPlane/dependencyManagedState.js";

test("writeManagedDependencyRecord rejects corrupt managed state instead of overwriting it", async () => {
  const managedRoot = await mkdtemp(path.join(tmpdir(), "praxis-managed-state-corrupt-"));
  const statePath = path.join(managedRoot, "state.json");
  await writeFile(statePath, "{not-json", "utf8");

  try {
    await assert.rejects(
      writeManagedDependencyRecord({
        managedRoot,
        record: {
          dependencyId: "dependency.binary.fake",
          sourceId: "test:fake",
          status: "installed",
          updatedAt: "2026-05-25T00:00:00.000Z",
        },
      }),
      /Invalid JSON/u,
    );
    assert.equal(await readFile(statePath, "utf8"), "{not-json");
  } finally {
    await rm(managedRoot, { recursive: true, force: true });
  }
});

test("writeProjectDependencyLockEntry rejects corrupt lock state instead of overwriting it", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "praxis-project-lock-corrupt-"));
  const lockPath = path.join(root, "dependency-lock.json");
  await writeFile(lockPath, "{not-json", "utf8");

  try {
    await assert.rejects(
      writeProjectDependencyLockEntry({
        lockPath,
        entry: {
          dependencyId: "dependency.binary.fake",
          sourceId: "test:fake",
        },
      }),
      /Invalid JSON/u,
    );
    assert.equal(await readFile(lockPath, "utf8"), "{not-json");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
