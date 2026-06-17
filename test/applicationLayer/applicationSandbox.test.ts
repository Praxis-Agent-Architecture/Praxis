import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  createApplicationProjectRuntime,
  type PraxisApplicationSandboxMountMatrixOutput,
} from "../../src/applicationLayer/index.js";

function sandboxMountMatrixOutput(value: unknown): PraxisApplicationSandboxMountMatrixOutput {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  assert.equal((value as { kind?: unknown }).kind, "praxis.application.sandboxMountMatrix");
  return value as PraxisApplicationSandboxMountMatrixOutput;
}

async function createSandboxMatrixProject(): Promise<string> {
  const tempRoot = path.join(process.cwd(), ".tmp");
  await mkdir(tempRoot, { recursive: true });
  const projectRoot = await mkdtemp(path.join(tempRoot, "praxis-application-sandbox-matrix-"));
  await writeFile(path.join(projectRoot, "rax.project.json"), `${JSON.stringify({
    id: "application-sandbox-matrix",
    entry: "praxis.agent.ts",
    export: "SandboxMatrixAgent",
    application: { id: "application.sandboxMatrix" },
    agent: { id: "agent.application.sandboxMatrix" },
  }, null, 2)}\n`);
  await writeFile(path.join(projectRoot, "praxis.agent.ts"), `import { praxis } from "@praxis-ai/praxis";

export class SandboxMatrixAgent extends praxis.Agent {
  identity = "agent.application.sandboxMatrix";
  model = praxis.model("gpt-test");
  storage = praxis.storage.memory();
  session = praxis.session({ persistence: "memory" });
  sandbox = praxis.sandbox.linuxBubblewrapReadonly();
  toolPolicy = praxis.toolPolicies.standard();
  harness = praxis.harness({
    tools: praxis.tools([
      praxis.basetool.core.shellRun({ profileName: "runtimeCore" }),
    ]),
    policy: praxis.policy({
      allowProviderCall: true,
      allowToolExecution: true,
      scopes: ["agent.invoke", "tool.execute", "shell:run"],
    }),
    loop: praxis.loop.standard(),
  });
}

export default SandboxMatrixAgent;
`);
  return projectRoot;
}

test("application runtime dispatches sandbox mount matrix through the application facade", async () => {
  const projectRoot = await createSandboxMatrixProject();
  try {
    const created = await createApplicationProjectRuntime(projectRoot, {
      now: () => "2026-06-09T00:00:00.000Z",
      runtimeId: "runtime.application.sandboxMatrix",
      sessionId: "session.application.sandboxMatrix",
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const inspected = await created.runtime.dispatch({
      type: "application.inspectSandboxMountMatrix",
      command: {
        program: "sh",
        args: ["-lc", "printf sandbox-matrix"],
        cwd: projectRoot,
      },
    });

    assert.equal(inspected.ok, true);
    const output = sandboxMountMatrixOutput(inspected.output);
    assert.equal(output.kind, "praxis.application.sandboxMountMatrix");
    assert.equal(output.sessionId, "session.application.sandboxMatrix");
    assert.equal(output.runtimeId, "runtime.application.sandboxMatrix");
    assert.equal(output.matrix.surface, "runtime.sandboxPlane.mountMatrix");
    assert.equal(output.matrix.publicSafe, true);
    assert.equal(output.matrix.sandbox.providerFamily, "linux-bubblewrap");
    assert.equal(output.matrix.provider.prepared, true);
    assert.equal(output.matrix.commandPlanPreview.executesCommand, false);
    assert.equal(output.matrix.raxcell.policyOwner, "praxis");
    assert.equal(output.matrix.raxcell.providerRole, "environment-and-execution");
    assert.equal(output.matrix.policyMiddleware.mounted, true);
    assert.equal(output.publicSafe, true);
  } finally {
    await rm(projectRoot, { recursive: true, force: true });
  }
});
