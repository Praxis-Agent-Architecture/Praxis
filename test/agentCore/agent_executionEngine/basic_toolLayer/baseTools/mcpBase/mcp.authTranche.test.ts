import assert from "node:assert/strict";
import test from "node:test";

import { createBaseToolRegistry } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";
import {
  executeMcpAuthenticate,
  mcpAuthenticateHandler,
  planMcpAuthenticate,
  type McpAuthenticateProvider,
} from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/mcpBase/auth/mcp.authenticate.js";
import {
  executeMcpAuthorize,
  mcpAuthorizeHandler,
  planMcpAuthorize,
  type McpAuthorizeProvider,
} from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/mcpBase/auth/mcp.authorize.js";
import type { BaseToolExecutorPort } from "../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";

test("mcp auth tools keep legacy dry-run preview behavior", () => {
  const authenticate = planMcpAuthenticate({
    target: { serverId: "fs-mcp", authStrategy: "oauth", credentialRef: "secret://mcp/fs", requestedScopes: ["mcp:fs", "mcp:fs"] },
    context: { invocationId: "auth-1", allowedServerIds: ["fs-mcp"], grantedPermissions: ["mcp:connect", "mcp:auth"] },
  });
  assert.equal(authenticate.ok, true);
  if (authenticate.ok) {
    assert.equal(authenticate.output.dryRun, true);
    assert.equal(authenticate.output.providerCalled, false);
    assert.equal(authenticate.output.tokenIssued, false);
    assert.deepEqual(authenticate.output.authEnvelope.requestedScopes, ["mcp:fs"]);
  }

  const authorize = planMcpAuthorize({
    target: { serverId: "fs-mcp", subjectId: "runtime:agent", action: "call-tool", toolName: "read_file" },
    context: { invocationId: "authz-1", allowedServerIds: ["fs-mcp"], grantedPermissions: ["mcp:auth", "mcp:read"] },
  });
  assert.equal(authorize.ok, true);
  if (authorize.ok) {
    assert.equal(authorize.output.dryRun, true);
    assert.equal(authorize.output.providerCalled, false);
    assert.equal(authorize.output.authorizationGranted, false);
    assert.equal(authorize.output.decision, "dry-run-policy-envelope");
  }
});

test("mcp auth tools require guard and never call provider during dry-run", async () => {
  let calls = 0;
  const authenticateProvider: McpAuthenticateProvider = () => {
    calls += 1;
    return { status: "authenticated" };
  };
  const dryRun = await executeMcpAuthenticate({
    target: { serverId: "fs-mcp", authStrategy: "oauth", credentialRef: "secret://mcp/fs" },
    provider: authenticateProvider,
  });
  assert.equal(dryRun.ok, true);
  assert.equal(calls, 0);

  const rejected = await executeMcpAuthenticate({
    target: { serverId: "fs-mcp", authStrategy: "oauth", credentialRef: "secret://mcp/fs" },
    context: { dryRun: false },
    provider: authenticateProvider,
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error.code, "GOVERNANCE_REJECTED");
  assert.equal(calls, 0);
});

test("mcp auth tools call fake providers and hide provider failures", async () => {
  const authenticate = await executeMcpAuthenticate({
    target: { serverId: "fs-mcp", authStrategy: "oauth", credentialRef: "secret://mcp/fs" },
    context: { dryRun: false, guard: { accepted: true }, grantedPermissions: ["mcp:connect", "mcp:auth"] },
    provider: () => ({ status: "authenticated", authSessionId: "session-1", providerMetadata: { runtimeEntry: "fake.authenticate" } }),
  });
  assert.equal(authenticate.ok, true);
  if (authenticate.ok) {
    assert.equal(authenticate.output.providerCalled, true);
    assert.equal(authenticate.output.tokenIssued, true);
    assert.equal(authenticate.output.providerMetadata?.runtimeEntry, "fake.authenticate");
  }

  const authorize = await executeMcpAuthorize({
    target: { serverId: "fs-mcp", subjectId: "runtime:agent", action: "read-resource", resourceUri: "file:///workspace/README.md" },
    context: { dryRun: false, guard: { allowed: true }, grantedPermissions: ["mcp:auth", "mcp:read"] },
    provider: () => ({ decision: "allowed", policyId: "policy-1", providerMetadata: { runtimeEntry: "fake.authorize" } }),
  });
  assert.equal(authorize.ok, true);
  if (authorize.ok) {
    assert.equal(authorize.output.providerCalled, true);
    assert.equal(authorize.output.authorizationGranted, true);
    assert.equal(authorize.output.providerMetadata?.runtimeEntry, "fake.authorize");
  }

  const unavailable = await executeMcpAuthorize({
    target: { serverId: "fs-mcp", subjectId: "runtime:agent", action: "call-tool" },
    context: { dryRun: false, guard: { accepted: true } },
  });
  assert.equal(unavailable.ok, false);
  if (!unavailable.ok) assert.equal(unavailable.error.code, "PROVIDER_UNAVAILABLE");

  const thrown = await executeMcpAuthenticate({
    target: { serverId: "fs-mcp", authStrategy: "oauth", credentialRef: "secret://mcp/fs" },
    context: { dryRun: false, guard: { accepted: true } },
    provider: () => {
      throw new Error("secret provider detail");
    },
  });
  assert.equal(thrown.ok, false);
  if (!thrown.ok) {
    assert.equal(thrown.error.code, "PROVIDER_REJECTED");
    assert.equal(thrown.error.internalDetailExposed, false);
    assert.doesNotMatch(thrown.error.message, /secret provider detail/u);
  }
});

test("mcp auth tools report malformed JSON and permission gaps as public-safe errors", async () => {
  const malformedAuthenticate = await executeMcpAuthenticate({
    target: { serverId: 1, authStrategy: "oauth", credentialRef: "secret://mcp/fs" },
  });
  assert.equal(malformedAuthenticate.ok, false);
  if (!malformedAuthenticate.ok) assert.equal(malformedAuthenticate.error.code, "INVALID_SERVER_ID");

  const malformedAuthorize = await executeMcpAuthorize({
    target: { serverId: "fs-mcp", subjectId: null, action: "call-tool" },
  });
  assert.equal(malformedAuthorize.ok, false);
  if (!malformedAuthorize.ok) assert.equal(malformedAuthorize.error.code, "MISSING_SUBJECT_ID");

  const missingPermission = await executeMcpAuthorize({
    target: { serverId: "fs-mcp", subjectId: "runtime:agent", action: "call-tool" },
    context: { grantedPermissions: ["mcp:auth"] },
  });
  assert.equal(missingPermission.ok, false);
  if (!missingPermission.ok) assert.equal(missingPermission.error.code, "PERMISSION_DENIED");
});

test("mcp auth handlers invoke runtime MCP executor ports", async () => {
  const executor: BaseToolExecutorPort = {
    mcp: {
      async authenticate(request) {
        return { ok: true, output: { status: "authenticated", authSessionId: "session-1", providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.authenticate", credentialRef: request.credentialRef } } };
      },
      async authorize(request) {
        return { ok: true, output: { decision: "allowed", policyId: "policy-1", providerMetadata: { runtimeEntry: "BaseToolExecutorPort.mcp.authorize", subjectId: request.subjectId } } };
      },
    },
  };

  const authenticate = await mcpAuthenticateHandler.invoke({
    runtimeId: "runtime",
    sessionId: "session",
    toolCallId: "tool-call",
    input: {
      target: { serverId: "fs-mcp", authStrategy: "oauth", credentialRef: "secret://mcp/fs" },
      context: { dryRun: false, guard: { accepted: true } },
    },
    executor,
  });
  assert.equal(authenticate.ok, true);
  if (authenticate.ok) assert.equal(authenticate.output.providerMetadata?.runtimeEntry, "BaseToolExecutorPort.mcp.authenticate");

  const authorize = await mcpAuthorizeHandler.invoke({
    runtimeId: "runtime",
    sessionId: "session",
    toolCallId: "tool-call",
    input: {
      target: { serverId: "fs-mcp", subjectId: "runtime:agent", action: "call-tool" },
      context: { dryRun: false, guard: { accepted: true } },
    },
    executor,
  });
  assert.equal(authorize.ok, true);
  if (authorize.ok) assert.equal(authorize.output.providerMetadata?.runtimeEntry, "BaseToolExecutorPort.mcp.authorize");
});

test("mcp auth tools resolve through the baseTool registry", async () => {
  const registry = createBaseToolRegistry();
  for (const toolId of ["mcp.authenticate", "mcp.authorize"] as const) {
    const resolved = registry.lookupHandler(toolId);
    assert.equal(resolved.ok, true);
    if (resolved.ok) assert.ok(resolved.handler);
  }
});
