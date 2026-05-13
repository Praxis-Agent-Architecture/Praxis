import { strict as assert } from "node:assert";
import test from "node:test";

import { planShellBackgroundExecution } from "../processControl/shell.backgroundExecution/core.js";
import { executeShellCommand, planShellCommandExecution } from "./shell.commandExecution/core.js";
import { executeShellScript } from "./shell.scriptExecution/core.js";

const runtimeContext = {
  runtimeId: "runtime.test.shell.workspace-write-guard",
};

test("shell command execution rejects workspace file writes through redirection", () => {
  const result = planShellCommandExecution({
    context: runtimeContext,
    command: "bash",
    args: ["-lc", "cat > package.json <<'EOF'\n{}\nEOF"],
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "WORKSPACE_WRITE_REQUIRES_CODE_TOOL");
  assert.match(result.error.message, /code\.overwrite/u);
});

test("shell command execution rejects heredoc output writes before provider dispatch", async () => {
  let providerCalled = false;
  const result = await executeShellCommand({
    context: {
      ...runtimeContext,
      dryRun: false,
      guard: {
        accepted: true,
        allowed: true,
      },
    },
    command: "bash",
    args: [
      "-lc",
      "set -e\nmkdir -p public notes\ncat <<'EOF' > package.json\n{}\nEOF\nnode server.js",
    ],
    provider: () => {
      providerCalled = true;
      return {
        exitCode: 0,
        stdout: "",
        stderr: "",
      };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "WORKSPACE_WRITE_REQUIRES_CODE_TOOL");
  assert.equal(providerCalled, false);
  assert.match(result.error.message, /create or modify workspace files/u);
  assert.match(result.error.message, /code\.replaceFile/u);
});

test("shell script execution rejects tee file writes but keeps stdin heredocs available for tests", async () => {
  const rejected = await executeShellScript({
    context: runtimeContext,
    script: "printf 'hello' | tee README.md",
    language: "bash",
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error.code, "WORKSPACE_WRITE_REQUIRES_CODE_TOOL");

  const allowed = await executeShellScript({
    context: runtimeContext,
    script: "node - <<'NODE'\nconsole.log('smoke')\nNODE",
    language: "bash",
  });
  assert.equal(allowed.ok, true);
});

test("shell background execution rejects file redirection before launch", () => {
  const result = planShellBackgroundExecution({
    context: {
      runtimeId: runtimeContext.runtimeId,
      dryRun: true,
    },
    target: {
      command: "echo '{}' > package.json && node server.js",
      workingDirectory: ".",
      shell: "bash",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "WORKSPACE_WRITE_REQUIRES_CODE_TOOL");
});

test("shell script execution rejects ad-hoc programmatic file writes", async () => {
  const result = await executeShellScript({
    context: runtimeContext,
    script: "node -e \"require('fs').writeFileSync('server.js', 'console.log(1)')\"",
    language: "bash",
  });

  assert.equal(result.ok, false);
  assert.equal(result.error.code, "WORKSPACE_WRITE_REQUIRES_CODE_TOOL");
});

test("shell command execution allows verification output redirection to temporary files", () => {
  const result = planShellCommandExecution({
    context: runtimeContext,
    command: "bash",
    args: ["-lc", "curl -fsS http://localhost:3000/ >/tmp/markdown-bs-index.html"],
  });

  assert.equal(result.ok, true);
});

test("shell script execution allows programmatic temporary verification artifacts", async () => {
  const result = await executeShellScript({
    context: runtimeContext,
    script: "node -e \"require('fs').writeFileSync('/tmp/verification.txt', 'ok')\"",
    language: "bash",
  });

  assert.equal(result.ok, true);
});
