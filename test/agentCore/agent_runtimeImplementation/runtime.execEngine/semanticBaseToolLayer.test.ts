import assert from "node:assert/strict";
import test from "node:test";

import {
  baseToolCodingCoreDescriptor,
  basetool,
  compileAgent,
  createBaseToolRegistry,
  createBaseToolSupportCatalog,
  evaluateBaseToolRuntimeReadiness,
  harness,
  model,
  PraxisAgent,
} from "../../../../src/agentCore/index.js";
import { semanticBaseToolCatalog } from "../../../../src/basetool/catalog.js";
import type { BaseToolExecutorPort } from "../../../../src/basetool/types.js";

const coreToolIds = [
  "shell.run",
  "file.read",
  "file.search",
  "patch.apply",
  "web.search",
  "web.fetch",
  "plan.update",
  "user.ask",
  "skill.load",
  "context.load",
  "agent.spawn",
  "agent.message",
  "agent.inbox",
  "agent.list",
  "agent.inspect",
  "agent.wait",
  "agent.stop",
  "agent.kill",
  "mcp.use",
  "mcp.resources",
  "mcp.prompts",
  "mcp.completions",
  "media.viewImage",
  "process.wait",
  "process.kill",
  "tool.discover",
  "tool.describe",
] as const;

test("semantic basetool codingCore profile compiles through OAO harness", () => {
  class MinimalCodingAgent extends PraxisAgent {
    identity = "agent.semantic-basetool";
    model = model("gpt-5.5");
    harness = harness({ tools: basetool.profile("codingCore") });
  }

  const result = compileAgent(new MinimalCodingAgent());

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(
    result.manifest.harness.tools.map((toolSpec) => toolSpec.toolId),
    ["shell.run", "file.read", "file.search", "patch.apply", "web.search", "web.fetch", "plan.update", "user.ask", "skill.load", "context.load"],
  );
  assert.equal(result.manifest.harness.tools[0]?.family, "coreBase");
  assert.equal(result.manifest.harness.tools[0]?.metadata?.profileName, "codingCore");
});

test("semantic basetool registry includes the core plus multiagent mesh surface", () => {
  const registry = createBaseToolRegistry();
  assert.deepEqual(registry.all().map((definition) => definition.toolId), coreToolIds);
  assert.equal(registry.lookup("agent.spawn").ok, true);
  assert.equal(registry.lookup("browser.use").ok, false);
  assert.equal(registry.lookup("file.write").ok, false);
});

test("semantic basetool registry can render profile-specific tool descriptions", () => {
  const coding = createBaseToolRegistry({ profileName: "codingCore" }).lookup("shell.run");
  const work = createBaseToolRegistry({ profileName: "workCore" }).lookup("shell.run");

  assert.equal(coding.ok, true);
  assert.equal(work.ok, true);
  if (!coding.ok || !work.ok) return;
  assert.match(coding.definition.description, /tests, build commands, diagnostics/u);
  assert.match(work.definition.description, /documents, spreadsheets, reports/u);
});

test("semantic basetool registry dispatches to injected executor ports", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("shell.run");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolId: "shell.run",
    input: { command: "pwd" },
    executor: {
      shell: {
        run(request) {
          return {
            ok: true,
            output: { request },
          };
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.toolId, "shell.run");
  assert.deepEqual(result.output, { request: { command: "pwd" } });
  assert.deepEqual(result.events, ["basetool.core.shell.run.runtimePort"]);
});

test("basetool Coding Core descriptor exposes the implemented core tool ids", () => {
  assert.equal(baseToolCodingCoreDescriptor.surface, "basetool.core");
  assert.equal(baseToolCodingCoreDescriptor.directHostAccess, false);
  assert.equal(baseToolCodingCoreDescriptor.profileName, "agentCore");
  assert.deepEqual(baseToolCodingCoreDescriptor.toolIds, [
    "file.read",
    "file.search",
    "patch.apply",
    "web.search",
    "web.fetch",
    "shell.run",
    "skill.load",
    "context.load",
    "mcp.use",
    "mcp.resources",
    "mcp.prompts",
    "mcp.completions",
    "media.viewImage",
    "process.wait",
    "process.kill",
    "plan.update",
    "user.ask",
    "tool.discover",
    "tool.describe",
    "agent.spawn",
    "agent.message",
    "agent.inbox",
    "agent.list",
    "agent.inspect",
    "agent.wait",
    "agent.stop",
    "agent.kill",
  ]);
});

test("file.read validates input before invoking runtime ports", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("file.read");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolId: "file.read",
    input: {},
    executor: {
      filesystem: {
        readText() {
          throw new Error("should not be called");
        },
      },
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "MISSING_REQUIRED_FIELD");
});

test("file.read invokes filesystem.readText through the registry handler", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("file.read");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  let received: unknown;
  const result = await lookup.handler.invoke({
    toolId: "file.read",
    input: { path: "src/index.ts", maxBytes: 64 },
    executor: {
      filesystem: {
        readText(request) {
          received = request;
          return { ok: true, output: { content: "hello" } };
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(received, { path: "src/index.ts", maxBytes: 64 });
  assert.deepEqual(result.output, { content: "hello" });
  assert.equal(result.metadata?.runtimePort, "filesystem.readText");
});

test("shell.run reports provider unavailable when the shell port is not mounted", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("shell.run");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const result = await lookup.handler.invoke({
    toolId: "shell.run",
    input: { command: "pwd" },
    executor: {},
  });

  assert.equal(result.ok, false);
  assert.equal(result.error?.code, "PROVIDER_UNAVAILABLE");
  assert.equal(result.metadata?.runtimePort, "shell.run");
});

test("file.search validates query and calls search.ripgrep", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("file.search");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  let received: unknown;
  const invalid = await lookup.handler.invoke({
    toolId: "file.search",
    input: { query: "" },
    executor: {},
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error?.code, "INVALID_FIELD_VALUE");

  const result = await lookup.handler.invoke({
    toolId: "file.search",
    input: { query: "BaseTool", cwd: "src", glob: "*.ts" },
    executor: {
      search: {
        ripgrep(request) {
          received = request;
          return { ok: true, output: { matches: [{ path: "src/basetool/types.ts" }] } };
        },
      },
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(received, { query: "BaseTool", cwd: "src", glob: "*.ts" });
});

test("web.search and web.fetch call network runtime ports", async () => {
  const registry = createBaseToolRegistry();
  const searchLookup = registry.lookupHandler("web.search");
  const fetchLookup = registry.lookupHandler("web.fetch");
  assert.equal(searchLookup.ok, true);
  assert.equal(fetchLookup.ok, true);
  if (!searchLookup.ok || !fetchLookup.ok) return;

  let searchInput: unknown;
  const searchResult = await searchLookup.handler.invoke({
    toolId: "web.search",
    input: { query: "Praxis", maxResults: 3 },
    executor: {
      network: {
        search(request) {
          searchInput = request;
          return { ok: true, output: { results: [{ title: "Praxis" }] } };
        },
      },
    },
  });
  assert.equal(searchResult.ok, true);
  assert.deepEqual(searchInput, { query: "Praxis", maxResults: 3 });

  let fetchInput: unknown;
  const fetchResult = await fetchLookup.handler.invoke({
    toolId: "web.fetch",
    input: { url: "https://example.com", maxBytes: 128 },
    executor: {
      network: {
        fetch(request) {
          fetchInput = request;
          return { ok: true, output: { status: 200, text: "ok" } };
        },
      },
    },
  });
  assert.equal(fetchResult.ok, true);
  assert.deepEqual(fetchInput, { url: "https://example.com", maxBytes: 128 });
});

test("plan.update and user.ask call their runtime interaction ports", async () => {
  const registry = createBaseToolRegistry();
  const planLookup = registry.lookupHandler("plan.update");
  const askLookup = registry.lookupHandler("user.ask");
  assert.equal(planLookup.ok, true);
  assert.equal(askLookup.ok, true);
  if (!planLookup.ok || !askLookup.ok) return;

  const planResult = await planLookup.handler.invoke({
    toolId: "plan.update",
    input: { explanation: "step", plan: [{ step: "inspect", status: "completed" }] },
    executor: {
      plan: {
        update(request) {
          return { ok: true, output: { accepted: request } };
        },
      },
    },
  });
  assert.equal(planResult.ok, true);
  assert.deepEqual(planResult.output, { accepted: { explanation: "step", plan: [{ step: "inspect", status: "completed" }] } });

  const invalidAsk = await askLookup.handler.invoke({
    toolId: "user.ask",
    input: {},
    executor: {},
  });
  assert.equal(invalidAsk.ok, false);
  assert.equal(invalidAsk.error?.code, "MISSING_REQUIRED_FIELD");

  const askResult = await askLookup.handler.invoke({
    toolId: "user.ask",
    input: { prompt: "Confirm?" },
    executor: {
      userInteraction: {
        ask(request) {
          return { ok: true, output: { answer: "yes", request } };
        },
      },
    },
  });
  assert.equal(askResult.ok, true);
  assert.deepEqual(askResult.output, { answer: "yes", request: { prompt: "Confirm?", questions: [] } });
});

test("skill.load and context.load validate and call extension ports", async () => {
  const registry = createBaseToolRegistry();
  const skillLookup = registry.lookupHandler("skill.load");
  const contextLookup = registry.lookupHandler("context.load");
  const contextDefinition = semanticBaseToolCatalog.find((tool) => tool.toolId === "context.load");
  const planDefinition = semanticBaseToolCatalog.find((tool) => tool.toolId === "plan.update");
  assert.equal(skillLookup.ok, true);
  assert.equal(contextLookup.ok, true);
  assert.deepEqual(contextDefinition?.inputSchema.schema.required, ["kind"]);
  assert.deepEqual(contextDefinition?.permissionHints, ["context:read", "artifact:read"]);
  assert.equal(planDefinition?.inputSchema.schema.required, undefined);
  if (!skillLookup.ok || !contextLookup.ok) return;

  const invalidSkill = await skillLookup.handler.invoke({
    toolId: "skill.load",
    input: {},
    executor: {},
  });
  assert.equal(invalidSkill.ok, false);
  assert.equal(invalidSkill.error?.code, "MISSING_REQUIRED_FIELD");
  const invalidContext = await contextLookup.handler.invoke({
    toolId: "context.load",
    input: {},
    executor: {},
  });
  assert.equal(invalidContext.ok, false);
  assert.equal(invalidContext.error?.code, "MISSING_REQUIRED_FIELD");
  const missingContextSelector = await contextLookup.handler.invoke({
    toolId: "context.load",
    input: { kind: "workspaceIndex" },
    executor: {},
  });
  assert.equal(missingContextSelector.ok, false);
  assert.equal(missingContextSelector.error?.code, "MISSING_CONTEXT_SELECTOR");
  const missingContextRef = await contextLookup.handler.invoke({
    toolId: "context.load",
    input: { kind: "artifact", query: "not-enough" },
    executor: {},
  });
  assert.equal(missingContextRef.ok, false);
  assert.equal(missingContextRef.error?.code, "MISSING_CONTEXT_REF");

  let skillInput: unknown;
  const skillResult = await skillLookup.handler.invoke({
    toolId: "skill.load",
    input: { name: "basetool" },
    executor: {
      skill: {
        load(request) {
          skillInput = request;
          return { ok: true, output: { skill: "basetool" } };
        },
      },
    },
  });
  assert.equal(skillResult.ok, true);
  assert.deepEqual(skillInput, { name: "basetool" });

  let contextInput: unknown;
  const contextResult = await contextLookup.handler.invoke({
    toolId: "context.load",
    input: { kind: "workspaceIndex", query: "basetool", limit: 3 },
    executor: {
      context: {
        load(request) {
          contextInput = request;
          return { ok: true, output: { snippets: [] } };
        },
      },
    },
  });
  assert.equal(contextResult.ok, true);
  assert.deepEqual(contextInput, { kind: "workspaceIndex", query: "basetool", limit: 3 });
});

test("mcp.use, mcp.resources, mcp.prompts, and mcp.completions route to MCP runtime ports", async () => {
  const registry = createBaseToolRegistry();
  const useLookup = registry.lookupHandler("mcp.use");
  const resourcesLookup = registry.lookupHandler("mcp.resources");
  const promptsLookup = registry.lookupHandler("mcp.prompts");
  const completionsLookup = registry.lookupHandler("mcp.completions");
  assert.equal(useLookup.ok, true);
  assert.equal(resourcesLookup.ok, true);
  assert.equal(promptsLookup.ok, true);
  assert.equal(completionsLookup.ok, true);
  if (!useLookup.ok || !resourcesLookup.ok || !promptsLookup.ok || !completionsLookup.ok) return;

  let callInput: unknown;
  const callResult = await useLookup.handler.invoke({
    toolId: "mcp.use",
    input: { serverId: "docs", toolName: "search", arguments: { query: "Praxis" } },
    executor: {
      mcp: {
        call(request) {
          callInput = request;
          return { ok: true, output: { content: [] } };
        },
      },
    },
  });
  assert.equal(callResult.ok, true);
  assert.deepEqual(callInput, { serverId: "docs", toolName: "search", arguments: { query: "Praxis" } });

  let listInput: unknown;
  const listResult = await resourcesLookup.handler.invoke({
    toolId: "mcp.resources",
    input: { operation: "list", serverId: "docs", uriPrefix: "file://", cursor: "page-1" },
    executor: {
      mcp: {
        listResources(request) {
          listInput = request;
          return { ok: true, output: { resources: [] } };
        },
      },
    },
  });
  assert.equal(listResult.ok, true);
  assert.deepEqual(listInput, { serverId: "docs", uriPrefix: "file://", cursor: "page-1" });

  let templatesInput: unknown;
  const templatesResult = await resourcesLookup.handler.invoke({
    toolId: "mcp.resources",
    input: { operation: "templates", serverId: "docs", cursor: "templates-page-1" },
    executor: {
      mcp: {
        listResourceTemplates(request) {
          templatesInput = request;
          return { ok: true, output: { resourceTemplates: [] } };
        },
      },
    },
  });
  assert.equal(templatesResult.ok, true);
  assert.deepEqual(templatesInput, { serverId: "docs", cursor: "templates-page-1" });

  const invalidRead = await resourcesLookup.handler.invoke({
    toolId: "mcp.resources",
    input: { operation: "read" },
    executor: {},
  });
  assert.equal(invalidRead.ok, false);
  assert.equal(invalidRead.error?.code, "MISSING_REQUIRED_FIELD");

  let readInput: unknown;
  const readResult = await resourcesLookup.handler.invoke({
    toolId: "mcp.resources",
    input: { operation: "read", serverId: "docs", uri: "file://readme" },
    executor: {
      mcp: {
        readResource(request) {
          readInput = request;
          return { ok: true, output: { text: "ok" } };
        },
      },
    },
  });
  assert.equal(readResult.ok, true);
  assert.deepEqual(readInput, { serverId: "docs", uri: "file://readme" });

  let subscribeInput: unknown;
  const subscribeResult = await resourcesLookup.handler.invoke({
    toolId: "mcp.resources",
    input: { operation: "subscribe", serverId: "docs", uri: "file://readme" },
    executor: {
      mcp: {
        subscribe(request) {
          subscribeInput = request;
          return { ok: true, output: { subscriptionId: "sub-docs", status: "subscribed" } };
        },
      },
    },
  });
  assert.equal(subscribeResult.ok, true);
  assert.deepEqual(subscribeInput, {
    serverId: "docs",
    uri: "file://readme",
    subjectType: "resource",
    subject: "file://readme",
  });

  const invalidUnsubscribe = await resourcesLookup.handler.invoke({
    toolId: "mcp.resources",
    input: { operation: "unsubscribe", serverId: "docs" },
    executor: {},
  });
  assert.equal(invalidUnsubscribe.ok, false);
  assert.equal(invalidUnsubscribe.error?.code, "MISSING_REQUIRED_FIELD");

  let unsubscribeInput: unknown;
  const unsubscribeResult = await resourcesLookup.handler.invoke({
    toolId: "mcp.resources",
    input: { operation: "unsubscribe", serverId: "docs", subscriptionId: "sub-docs" },
    executor: {
      mcp: {
        unsubscribe(request) {
          unsubscribeInput = request;
          return { ok: true, output: { subscriptionId: "sub-docs", status: "unsubscribed" } };
        },
      },
    },
  });
  assert.equal(unsubscribeResult.ok, true);
  assert.deepEqual(unsubscribeInput, { serverId: "docs", subscriptionId: "sub-docs" });

  let listPromptsInput: unknown;
  const listPromptsResult = await promptsLookup.handler.invoke({
    toolId: "mcp.prompts",
    input: { operation: "list", serverId: "docs", cursor: "page-1" },
    executor: {
      mcp: {
        listPrompts(request) {
          listPromptsInput = request;
          return { ok: true, output: { prompts: [] } };
        },
      },
    },
  });
  assert.equal(listPromptsResult.ok, true);
  assert.deepEqual(listPromptsInput, { serverId: "docs", cursor: "page-1" });

  const invalidGetPrompt = await promptsLookup.handler.invoke({
    toolId: "mcp.prompts",
    input: { operation: "get" },
    executor: {},
  });
  assert.equal(invalidGetPrompt.ok, false);
  assert.equal(invalidGetPrompt.error?.code, "MISSING_REQUIRED_FIELD");

  let getPromptInput: unknown;
  const getPromptResult = await promptsLookup.handler.invoke({
    toolId: "mcp.prompts",
    input: { operation: "get", serverId: "docs", name: "triage", arguments: { topic: "repo" } },
    executor: {
      mcp: {
        getPrompt(request) {
          getPromptInput = request;
          return { ok: true, output: { messages: [] } };
        },
      },
    },
  });
  assert.equal(getPromptResult.ok, true);
  assert.deepEqual(getPromptInput, { serverId: "docs", name: "triage", arguments: { topic: "repo" } });

  let completeInput: unknown;
  const completeResult = await completionsLookup.handler.invoke({
    toolId: "mcp.completions",
    input: {
      serverId: "docs",
      ref: { type: "ref/resource", uri: "file://{name}" },
      argument: { name: "name", value: "rea" },
      context: { arguments: { folder: "docs" } },
    },
    executor: {
      mcp: {
        complete(request) {
          completeInput = request;
          return { ok: true, output: { completion: { values: ["readme.md"], total: 1, hasMore: false } } };
        },
      },
    },
  });
  assert.equal(completeResult.ok, true);
  assert.deepEqual(completeInput, {
    serverId: "docs",
    ref: { type: "ref/resource", uri: "file://{name}" },
    argument: { name: "name", value: "rea" },
    context: { arguments: { folder: "docs" } },
  });

  const invalidCompletion = await completionsLookup.handler.invoke({
    toolId: "mcp.completions",
    input: { ref: { type: "ref/prompt" }, argument: { name: "topic", value: "" } },
    executor: {},
  });
  assert.equal(invalidCompletion.ok, false);
  assert.equal(invalidCompletion.error?.code, "MISSING_REQUIRED_FIELD");
});

test("media.viewImage validates image selectors and calls media runtime port", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("media.viewImage");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const invalid = await lookup.handler.invoke({
    toolId: "media.viewImage",
    input: { prompt: "what is this?" },
    executor: {},
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error?.code, "MISSING_REQUIRED_FIELD");

  let received: unknown;
  const result = await lookup.handler.invoke({
    toolId: "media.viewImage",
    input: { imageRef: "attachment:1", prompt: "describe", detail: "high", maxBytes: 1024 },
    executor: {
      media: {
        viewImage(request) {
          received = request;
          return { ok: true, output: { description: "image" } };
        },
      },
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(received, { imageRef: "attachment:1", prompt: "describe", detail: "high", maxBytes: 1024 });
  assert.equal(result.metadata?.runtimePort, "media.viewImage");
});

test("process.wait and process.kill validate ids and call runtime process ports", async () => {
  const registry = createBaseToolRegistry();
  const waitLookup = registry.lookupHandler("process.wait");
  const killLookup = registry.lookupHandler("process.kill");
  assert.equal(waitLookup.ok, true);
  assert.equal(killLookup.ok, true);
  if (!waitLookup.ok || !killLookup.ok) return;

  const invalid = await waitLookup.handler.invoke({
    toolId: "process.wait",
    input: {},
    executor: {},
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error?.code, "MISSING_REQUIRED_FIELD");

  let waitInput: unknown;
  const waitResult = await waitLookup.handler.invoke({
    toolId: "process.wait",
    input: { processId: "p1", timeoutMs: 100 },
    executor: {
      process: {
        wait(request) {
          waitInput = request;
          return { ok: true, output: { status: "exited" } };
        },
      },
    },
  });
  assert.equal(waitResult.ok, true);
  assert.deepEqual(waitInput, { processId: "p1", timeoutMs: 100 });

  let killInput: unknown;
  const killResult = await killLookup.handler.invoke({
    toolId: "process.kill",
    input: { processId: "p2" },
    executor: {
      process: {
        kill(request) {
          killInput = request;
          return { ok: true, output: { killed: true } };
        },
      },
    },
  });
  assert.equal(killResult.ok, true);
  assert.deepEqual(killInput, { processId: "p2", signal: "SIGTERM" });
});

test("tool.discover and tool.describe route to runtime tool metadata ports", async () => {
  const registry = createBaseToolRegistry();
  const discoverLookup = registry.lookupHandler("tool.discover");
  const describeLookup = registry.lookupHandler("tool.describe");
  assert.equal(discoverLookup.ok, true);
  assert.equal(describeLookup.ok, true);
  if (!discoverLookup.ok || !describeLookup.ok) return;

  let discoverInput: unknown;
  const discoverResult = await discoverLookup.handler.invoke({
    toolId: "tool.discover",
    input: { query: "file", layer: "core" },
    executor: {
      tool: {
        discover(request) {
          discoverInput = request;
          return { ok: true, output: { tools: ["file.read", "file.search"] } };
        },
      },
    },
  });
  assert.equal(discoverResult.ok, true);
  assert.deepEqual(discoverInput, { query: "file", layer: "core" });

  const invalidDescribe = await describeLookup.handler.invoke({
    toolId: "tool.describe",
    input: {},
    executor: {},
  });
  assert.equal(invalidDescribe.ok, false);
  assert.equal(invalidDescribe.error?.code, "MISSING_REQUIRED_FIELD");

  let describeInput: unknown;
  const describeResult = await describeLookup.handler.invoke({
    toolId: "tool.describe",
    input: { toolId: "file.read" },
    executor: {
      tool: {
        describe(request) {
          describeInput = request;
          return { ok: true, output: { toolId: "file.read" } };
        },
      },
    },
  });
  assert.equal(describeResult.ok, true);
  assert.deepEqual(describeInput, { toolId: "file.read" });
});

test("patch.apply applies add update and delete through filesystem ports", async () => {
  const lookup = createBaseToolRegistry().lookupHandler("patch.apply");
  assert.equal(lookup.ok, true);
  if (!lookup.ok) return;

  const files = new Map<string, string>([
    ["update.txt", "hello\nold\nbye\n"],
    ["delete.txt", "remove me\n"],
  ]);
  const executor: BaseToolExecutorPort = {
    filesystem: {
      readText(request) {
        const path = String((request as { path: unknown }).path);
        const content = files.get(path);
        if (content === undefined) {
          return {
            ok: false,
            error: {
              code: "ENOENT",
              message: "missing",
              publicSafe: true,
            },
          };
        }
        return { ok: true, output: { content } };
      },
      writeText(request) {
        const typed = request as { path: string; content: string };
        files.set(typed.path, typed.content);
        return { ok: true, output: { path: typed.path } };
      },
      deletePath(request) {
        const path = String((request as { path: unknown }).path);
        files.delete(path);
        return { ok: true, output: { path } };
      },
    },
  };

  const result = await lookup.handler.invoke({
    toolId: "patch.apply",
    input: {
      patch: [
        "*** Begin Patch",
        "*** Add File: add.txt",
        "+new",
        "*** Update File: update.txt",
        "@@",
        " hello",
        "-old",
        "+new",
        " bye",
        "*** Delete File: delete.txt",
        "*** End Patch",
      ].join("\n"),
    },
    executor,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(files.get("add.txt"), "new\n");
  assert.deepEqual(files.get("update.txt"), "hello\nnew\nbye\n");
  assert.equal(files.has("delete.txt"), false);
  assert.equal((result.output as { summary?: string }).summary, "Applied patch to 3 files.");
  assert.deepEqual((result.output as { changed?: readonly string[] }).changed, ["add.txt", "update.txt", "delete.txt"]);
  assert.deepEqual((result.output as { changedFiles?: readonly string[] }).changedFiles, ["add.txt", "update.txt", "delete.txt"]);
  assert.equal((result.output as { changeCount?: number }).changeCount, 3);
  assert.equal((result.output as { additions?: number }).additions, 2);
  assert.equal((result.output as { deletions?: number }).deletions, 1);
  assert.deepEqual((result.output as { entries?: readonly unknown[] }).entries, [
    { path: "add.txt", changeType: "add", additions: 1, deletions: 0 },
    { path: "update.txt", changeType: "update", additions: 1, deletions: 1 },
    { path: "delete.txt", changeType: "delete" },
  ]);
  assert.deepEqual((result.output as { diffPreview?: readonly string[] }).diffPreview, [
    "@@ add.txt @@",
    "+ new",
    "@@ update.txt @@",
    "- old",
    "+ new",
    "@@ delete.txt @@",
  ]);
  assert.match(String((result.output as { contextHint?: string }).contextHint), /Do not reread/u);

  const createNewFileResult = await lookup.handler.invoke({
    toolId: "patch.apply",
    input: {
      patch: [
        "*** Begin Patch",
        "*** Create New File: drift.txt",
        "+drift",
        "*** End Patch",
      ].join("\n"),
    },
    executor,
  });
  assert.equal(createNewFileResult.ok, true);
  assert.deepEqual(files.get("drift.txt"), "drift\n");

  const fileDirectiveResult = await lookup.handler.invoke({
    toolId: "patch.apply",
    input: {
      patch: [
        "*** Begin Patch",
        "*** File: file-directive.txt",
        "+file directive",
        "*** End Patch",
      ].join("\n"),
    },
    executor,
  });
  assert.equal(fileDirectiveResult.ok, true);
  assert.deepEqual(files.get("file-directive.txt"), "file directive\n");

  const unifiedAddResult = await lookup.handler.invoke({
    toolId: "patch.apply",
    input: {
      patch: [
        "*** Begin Patch",
        "--- /dev/null",
        "+++ b/unified.txt",
        "@@",
        "+unified",
        "*** End Patch",
      ].join("\n"),
    },
    executor,
  });
  assert.equal(unifiedAddResult.ok, true);
  assert.deepEqual(files.get("unified.txt"), "unified\n");
});

test("semantic basetool support catalog reports readiness from implemented ports", () => {
  const catalog = createBaseToolSupportCatalog({ implementedPortPaths: ["shell.run"] });
  const shellRun = catalog.find((entry) => entry.toolId === "shell.run");
  const fileRead = catalog.find((entry) => entry.toolId === "file.read");
  const mcpPrompts = catalog.find((entry) => entry.toolId === "mcp.prompts");
  const mcpCompletions = catalog.find((entry) => entry.toolId === "mcp.completions");

  assert.equal(catalog.length, 27);
  assert.equal(shellRun?.readiness, "available");
  assert.equal(fileRead?.readiness, "unavailable");
  assert.deepEqual(mcpPrompts?.requiredSupports.map((support) => support.portPath), ["mcp.listPrompts", "mcp.getPrompt"]);
  assert.deepEqual(mcpCompletions?.requiredSupports.map((support) => support.portPath), ["mcp.complete"]);

  const readiness = evaluateBaseToolRuntimeReadiness({
    toolId: "shell.run",
    implementedPortPaths: ["shell.run"],
  });
  assert.equal(readiness.decision, "allowed");

  const listPromptReadiness = evaluateBaseToolRuntimeReadiness({
    toolId: "mcp.prompts",
    toolInput: { operation: "list" },
    implementedPortPaths: ["mcp.listPrompts"],
  });
  assert.equal(listPromptReadiness.decision, "allowed");

  const getPromptReadiness = evaluateBaseToolRuntimeReadiness({
    toolId: "mcp.prompts",
    toolInput: { operation: "get" },
    implementedPortPaths: ["mcp.getPrompt"],
  });
  assert.equal(getPromptReadiness.decision, "allowed");

  const completionReadiness = evaluateBaseToolRuntimeReadiness({
    toolId: "mcp.completions",
    implementedPortPaths: ["mcp.complete"],
  });
  assert.equal(completionReadiness.decision, "allowed");
});
