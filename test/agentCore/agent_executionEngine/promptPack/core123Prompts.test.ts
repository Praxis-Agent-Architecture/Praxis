import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeclaredRuntimeContextMaterial,
  createToolDeclarationsMaterial,
  renderDeclaredRuntimeContext,
  renderToolDeclarations,
} from "../../../../src/executionEngine/promptPack/core123Prompts.js";

test("renderDeclaredRuntimeContext keeps application and harness instructions in layer 2", () => {
  const text = renderDeclaredRuntimeContext({
    agentName: "Praxis Test Agent",
    agentRole: "General runtime agent",
    applicationSurface: "examples/fullstack",
    language: "zh-CN",
    communicationStyle: "direct",
    toolProfile: "codingCore",
    policyMode: "permissive",
    sandboxMode: "host-observed",
    approvalBehavior: "on-risk",
    agentReviewBehavior: "side-agent",
    sessionBehavior: "sqlite/auto/durable",
    workspaceRoot: "/workspace/project",
    allowedRoots: ["/workspace/project", "/workspace/project/.raxode"],
    applicationInstructions: "Use Conventional Commits.",
    harnessInstructions: "Follow the project coding style.",
  });

  assert.match(text, /# Declared Runtime Context/);
  assert.match(text, /Agent name: Praxis Test Agent/);
  assert.match(text, /Use Conventional Commits/);
  assert.match(text, /Follow the project coding style/);
  assert.match(text, /Workspace root: \/workspace\/project/);
  assert.match(text, /Allowed roots: \/workspace\/project, \/workspace\/project\/\.raxode/);
  assert.match(text, /must not override stableSystemCore/);
  assert.match(text, /Avoid repeating the same semantic work/);
});

test("createDeclaredRuntimeContextMaterial marks layer 2 as declaredRuntimeContext", () => {
  const material = createDeclaredRuntimeContextMaterial({ agentName: "agent" });

  assert.equal(material.id, "runtime:declared-context");
  assert.equal(material.promptSegmentKind, "declaredRuntimeContext");
  assert.equal(material.sourceCategory, "declared-built-in");
  assert.equal(material.trusted, true);
});

test("renderToolDeclarations carries layer 3 tool guidance and schemas", () => {
  const text = renderToolDeclarations({
    toolProfile: "codingCore",
    policyMode: "permissive",
    sandboxMode: "workspace-only",
    tools: [
      {
        toolId: "file.read",
        family: "coreBase",
        group: "file",
        description: "Read workspace files.",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
        metadata: { riskLevel: "safe" },
      },
    ],
    toolSpecificGuidance: "Before tool calls, describe the intended action briefly.",
  });

  assert.match(text, /# Tool Declarations/);
  assert.match(text, /Tool Use Contract/);
  assert.match(text, /file.read: Read workspace files/);
  assert.match(text, /inputSchema=/);
  assert.match(text, /Before tool calls/);
});

test("createToolDeclarationsMaterial marks layer 3 as toolDeclarations", () => {
  const material = createToolDeclarationsMaterial({ tools: [] });

  assert.equal(material.id, "runtime:tool-declarations");
  assert.equal(material.promptSegmentKind, "toolDeclarations");
  assert.equal(material.sourceCategory, "declared-built-in");
  assert.equal(material.metadata?.toolMaterialType, "policy");
});
