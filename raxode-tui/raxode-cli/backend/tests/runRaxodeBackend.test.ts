import assert from "node:assert/strict";
import test from "node:test";

import { parseRunnerArgs } from "../application/runRaxodeBackend.js";

test("runRaxodeBackend parser forwards backend smoke options", () => {
  const parsed = parseRunnerArgs([
    "--live",
    "--policy=yolo",
    "--sandbox=workspaceOnly",
    "--persistence=memory",
    "--minimal-tools",
    "--model=gpt-5.5",
    "--reasoning=minimal",
    "--max-output-tokens=512",
    "--provider=openai",
    "--endpoint-shape=responses",
    "--provider-route=openai_responses",
    "--base-url=https://example.test/v1",
    "inspect",
    "readiness",
  ]);

  assert.equal(parsed.command.mode, "live");
  assert.equal(parsed.command.permissionProfile, "yolo");
  assert.equal(parsed.command.model, "gpt-5.5");
  assert.equal(parsed.command.reasoningEffort, "minimal");
  assert.equal(parsed.command.task, "inspect readiness");
  assert.deepEqual(parsed.backend, {
    policyProfile: "yolo",
    sandboxProfile: "workspaceOnly",
    persistence: "memory",
    includeAllCatalogTools: false,
    model: "gpt-5.5",
    reasoningEffort: "minimal",
    maxOutputTokens: 512,
    provider: "openai",
    endpointShape: "responses",
    providerRoute: "openai_responses",
    baseURL: "https://example.test/v1",
  });
});

test("runRaxodeBackend parser keeps all catalog tools explicit", () => {
  const parsed = parseRunnerArgs([
    "--dry-run",
    "--all-catalog-tools",
  ]);

  assert.equal(parsed.command.mode, "dry-run");
  assert.equal(parsed.backend.includeAllCatalogTools, true);
  assert.equal(parsed.command.task, "Describe the Raxode application backend readiness.");
});
