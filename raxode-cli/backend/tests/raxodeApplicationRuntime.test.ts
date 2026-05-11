import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createApplicationProjectRuntime,
  createLocalApplicationTransport,
} from "../../../src/applicationLayer/index.js";
import type { OpenAIV1ResponsesRequestEnvelope } from "../../../src/agentCore/agent_modelAdapter/actualInvocationLayer/openai/v1_responses.js";
import type { AuthEnvelope } from "../../../src/agentCore/agent_modelAdapter/authProfileLayer/authEnvelope.js";
import {
  createRaxodeBackend,
  createRaxodeBackendRestServer,
  createRaxodeBackendWebSocketServer,
} from "../raxodeBackend.js";

test("raxode backend runs through applicationLayer", async () => {
  const backend = await createRaxodeBackend({
    now: () => "2026-05-10T00:00:00.000Z",
  });
  const result = await backend.run({
    task: "dry-run readiness",
    mode: "dry-run",
    sessionId: "session.raxode.test",
    permissionProfile: "bapr",
  });
  assert.equal(result.ok, true);
  assert.equal(result.view.applicationId, "application.raxode.coding");
  assert.equal(result.view.sessionId, "session.raxode.test");
  assert.equal(result.view.agentId, "agent.raxode.coding");
  assert.equal(result.view.permissionProfile, "bapr");
  assert.equal(result.view.model.contextWindowTokens, 400_000);
  assert.equal(result.view.model.maxInputTokens, 272_000);
  assert.equal(result.view.model.inputBudgetThreshold, 0.95);
  assert.equal(result.view.model.usableInputTokens, 258_400);
  assert.equal(result.view.tools.mounted, 175);
});

test("raxode application runtime includes prior same-session turns in the next provider prompt", async () => {
  const providerBodies: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };
  const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
    applicationId: "application.raxode.coding",
    mode: "live",
    model: "gpt-5.5",
    reasoningEffort: "low",
    permissionProfile: "bapr",
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
        providerBodies.push(envelope.body);
        return {
          output_text: providerBodies.length === 1
            ? "已记住暗号 BLUE-ORBIT。"
            : "刚才的暗号是 BLUE-ORBIT。",
        };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const transport = createLocalApplicationTransport(created.runtime);
  const sessionId = "session.raxode.history.test";
  const start = await transport.dispatch({
    type: "application.start",
    sessionId,
    cwd: process.cwd(),
    mode: "live",
  });
  assert.equal(start.ok, true);
  const first = await transport.dispatch({
    type: "application.submitTurn",
    sessionId,
    mode: "live",
    input: {
      type: "application.input",
      text: "请记住暗号 BLUE-ORBIT。",
      cwd: process.cwd(),
    },
  });
  assert.equal(first.ok, true);
  const second = await transport.dispatch({
    type: "application.submitTurn",
    sessionId,
    mode: "live",
    input: {
      type: "application.input",
      text: "刚才的暗号是什么？",
      cwd: process.cwd(),
    },
  });
  assert.equal(second.ok, true);
  assert.equal(providerBodies.length, 2);
  const secondBody = JSON.stringify(providerBodies[1]);
  assert.match(secondBody, /Previous conversation in this Raxode application session/u);
  assert.match(secondBody, /请记住暗号 BLUE-ORBIT/u);
  assert.match(secondBody, /已记住暗号 BLUE-ORBIT/u);
  assert.match(secondBody, /Current user request/u);
  assert.match(secondBody, /刚才的暗号是什么/u);
});

test("raxode application runtime routes omni.viewImage through Responses image input", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-vision-"));
  const imagePath = path.join(workspace, "screenshot.png");
  await writeFile(
    imagePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
  );

  const providerBodies: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "bapr",
      now: () => "2026-05-10T00:00:00.000Z",
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerBodies.push(envelope.body);
          const bodyText = JSON.stringify(envelope.body);
          if (bodyText.includes("input_image")) {
            return { output_text: "The image contains a tiny test pixel." };
          }
          if (providerBodies.length === 1) {
            return {
              output: [{
                type: "function_call",
                name: "omni.viewImage",
                call_id: "omni-view-image-call",
                arguments: JSON.stringify({
                  target: { imagePath, mediaType: "image/png", detail: "low" },
                  context: { grantedPermissions: ["tool.execute"] },
                }),
              }],
            };
          }
          return { output_text: "视觉链路已完成。" };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    const sessionId = "session.raxode.vision.test";
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: workspace,
      mode: "live",
    });
    assert.equal(start.ok, true);
    const result = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "请查看这张截图。",
        cwd: workspace,
      },
    });

    assert.equal(result.ok, true);
    const providerBodyText = JSON.stringify(providerBodies);
    assert.match(providerBodyText, /input_image/u);
    assert.match(providerBodyText, /data:image\/png;base64/u);
    assert.match(providerBodyText, /The image contains a tiny test pixel/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode application runtime emits tool argument previews for failed tool calls", async () => {
  const events: unknown[] = [];
  let providerCallCount = 0;
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };
  const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
    applicationId: "application.raxode.coding",
    mode: "live",
    model: "gpt-5.5",
    reasoningEffort: "low",
    permissionProfile: "bapr",
    now: () => "2026-05-10T00:00:00.000Z",
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      providerCaller: async (_envelope: OpenAIV1ResponsesRequestEnvelope) => {
        providerCallCount += 1;
        if (providerCallCount > 1) {
          return { output_text: "键盘调用失败已记录。" };
        }
        return {
          output: [{
            type: "function_call",
            name: "computeruse.keyboardEmulation",
            call_id: "keyboard-bad-action-call",
            arguments: JSON.stringify({
              purpose: "focus the browser address bar",
              target: {
                targetHint: "desktop",
                actions: ["Control+L"],
              },
              context: { grantedPermissions: ["tool.execute"] },
            }),
          }],
        };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const transport = createLocalApplicationTransport(created.runtime);
  const unsubscribe = transport.subscribe((event) => events.push(event));
  try {
    const start = await transport.dispatch({
      type: "application.start",
      sessionId: "session.raxode.tool-argument-preview.test",
      cwd: process.cwd(),
      mode: "live",
    });
    assert.equal(start.ok, true);
    const result = await transport.dispatch({
      type: "application.submitTurn",
      sessionId: "session.raxode.tool-argument-preview.test",
      mode: "live",
      input: {
        type: "application.input",
        text: "请打开浏览器。",
        cwd: process.cwd(),
      },
    });
    assert.equal(result.ok, true);
  } finally {
    unsubscribe();
  }

  const failedToolEvent = events
    .map((event) => event as { kind?: string; metadata?: Record<string, unknown> })
    .find((event) =>
      event.kind === "tool"
      && event.metadata?.toolId === "computeruse.keyboardEmulation"
      && event.metadata?.toolStatus === "failed"
    );
  assert.ok(failedToolEvent);
  assert.match(String(failedToolEvent.metadata?.argumentsPreview), /Control\+L/u);
  assert.match(String(failedToolEvent.metadata?.argumentsPreview), /desktop/u);
});

test("raxode bapr carries application approval into detached shell TAP approval fields", async () => {
  const events: unknown[] = [];
  let providerCallCount = 0;
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };
  const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
    applicationId: "application.raxode.coding",
    mode: "live",
    model: "gpt-5.5",
    reasoningEffort: "low",
    permissionProfile: "bapr",
    now: () => "2026-05-10T00:00:00.000Z",
    approvalResolver: async (envelope) => {
      throw new Error(`unexpected approval request: ${envelope.approvalId}`);
    },
    liveProviderResolver: async () => ({
      auth: fakeAuth,
      providerCaller: async (_envelope: OpenAIV1ResponsesRequestEnvelope) => {
        providerCallCount += 1;
        if (providerCallCount > 1) {
          return { output_text: "detached launch completed without manual approval." };
        }
        return {
          output: [{
            type: "function_call",
            name: "shell.detachedExecution",
            call_id: "detached-chrome-call",
            arguments: JSON.stringify({
              target: {
                command: "printf detached-ok",
                workingDirectory: "/tmp",
                shell: "sh",
              },
              context: {
                guard: {
                  accepted: true,
                  allowed: true,
                  reason: "User requested opening a browser.",
                },
              },
            }),
          }],
        };
      },
    }),
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const transport = createLocalApplicationTransport(created.runtime);
  const unsubscribe = transport.subscribe((event) => events.push(event));
  let result: Awaited<ReturnType<typeof transport.dispatch>> | undefined;
  try {
    const start = await transport.dispatch({
      type: "application.start",
      sessionId: "session.raxode.detached-approval.test",
      cwd: process.cwd(),
      mode: "live",
    });
    assert.equal(start.ok, true);
    result = await transport.dispatch({
      type: "application.submitTurn",
      sessionId: "session.raxode.detached-approval.test",
      mode: "live",
      input: {
        type: "application.input",
        text: "打开 Chrome。",
        cwd: process.cwd(),
      },
    });
  } finally {
    unsubscribe();
  }

  assert.ok(result);
  assert.equal(result.ok, true);
  assert.equal(providerCallCount, 2);
  if (result.ok) {
    assert.match(result.view.finalOutput ?? "", /detached launch completed/u);
  }
  const completedToolEvent = events
    .map((event) => event as { kind?: string; metadata?: Record<string, unknown> })
    .find((event) =>
      event.kind === "tool"
      && event.metadata?.toolId === "shell.detachedExecution"
      && event.metadata?.toolStatus === "completed"
  );
  assert.ok(completedToolEvent);
  assert.equal(completedToolEvent.metadata?.errorPreview, undefined);
  assert.match(String(completedToolEvent.metadata?.outputPreview), /shell\.detachedExecution/u);
});

test("raxode application runtime resolves pasted image references to local attachment paths", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-attachment-vision-"));
  const imagePath = path.join(workspace, "clipboard-image-1.png");
  await writeFile(
    imagePath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    ),
  );

  const providerBodies: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "bapr",
      now: () => "2026-05-10T00:00:00.000Z",
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerBodies.push(envelope.body);
          const bodyText = JSON.stringify(envelope.body);
          if (bodyText.includes("input_image")) {
            return { output_text: "The pasted image contains a tiny test pixel." };
          }
          if (providerBodies.length === 1) {
            return {
              output: [{
                type: "function_call",
                name: "omni.viewImage",
                call_id: "omni-view-image-ref-call",
                arguments: JSON.stringify({
                  target: { imageRef: "Image #1", detail: "low" },
                  context: { grantedPermissions: ["tool.execute"] },
                }),
              }],
            };
          }
          return { output_text: "附件视觉链路已完成。" };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    const sessionId = "session.raxode.attachment-vision.test";
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: workspace,
      mode: "live",
    });
    assert.equal(start.ok, true);
    const result = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "你好！[Image #1]看一下这个图片里面是啥。",
        cwd: workspace,
        attachments: [{
          id: "clipboard-image:1",
          kind: "image",
          tokenText: "[Image #1]",
          displayName: "clipboard image 1",
          localPath: imagePath,
          mimeType: "image/png",
        }],
      },
    });

    assert.equal(result.ok, true);
    const providerBodyText = JSON.stringify(providerBodies);
    assert.match(providerBodyText, /Application input attachments for this user request/u);
    assert.match(providerBodyText, /localPath=/u);
    assert.match(providerBodyText, /input_image/u);
    assert.match(providerBodyText, /data:image\/png;base64/u);
    assert.match(providerBodyText, /The pasted image contains a tiny test pixel/u);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode application runtime routes omni.generateImage through Responses image_generation", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-image-generation-"));
  const outputPath = path.join(workspace, "generated.png");

  const providerBodies: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "bapr",
      now: () => "2026-05-10T00:00:00.000Z",
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerBodies.push(envelope.body);
          const bodyRecord = envelope.body as { tools?: readonly { type?: string }[] };
          if (bodyRecord.tools?.some((tool) => tool.type === "image_generation")) {
            return {
              output: [{
                id: "ig_test",
                type: "image_generation_call",
                status: "completed",
                revised_prompt: "A tiny generated test image.",
                result: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
              }],
            };
          }
          if (providerBodies.length === 1) {
            return {
              output: [{
                type: "function_call",
                name: "omni.generateImage",
                call_id: "omni-generate-image-call",
                arguments: JSON.stringify({
                  target: {
                    prompt: "Draw a tiny test image.",
                    outputPath,
                    mimeType: "image/png",
                    size: "512x512",
                    quality: "low",
                  },
                  context: { grantedPermissions: ["tool.execute"] },
                }),
              }],
            };
          }
          return { output_text: "图片生成链路已完成。" };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    const sessionId = "session.raxode.generate-image.test";
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: workspace,
      mode: "live",
    });
    assert.equal(start.ok, true);
    const result = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "生成一张测试图片。",
        cwd: workspace,
      },
    });

    assert.equal(result.ok, true);
    const imageGenerationBody = providerBodies.find((body) => {
      const record = body as { tools?: readonly { type?: string }[] };
      return record.tools?.some((tool) => tool.type === "image_generation");
    }) as { stream?: boolean; tool_choice?: unknown; tools?: readonly Record<string, unknown>[] } | undefined;
    assert.ok(imageGenerationBody);
    assert.equal(imageGenerationBody.stream, true);
    assert.deepEqual(imageGenerationBody.tool_choice, { type: "image_generation" });
    assert.equal(imageGenerationBody.tools?.[0]?.type, "image_generation");
    assert.equal(imageGenerationBody.tools?.[0]?.action, undefined);
    assert.equal(imageGenerationBody.tools?.[0]?.size, undefined);
    assert.equal(imageGenerationBody.tools?.[0]?.quality, "low");
    assert.equal(imageGenerationBody.tools?.[0]?.output_format, "png");
    const generated = await readFile(outputPath);
    assert.equal(generated.byteLength > 0, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode bapr auto-approves omni.generateImage and assigns a workspace artifact output path", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-image-generation-auto-"));

  const providerBodies: unknown[] = [];
  let approvalRequestCount = 0;
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "standard",
      now: () => "2026-05-10T00:00:00.000Z",
      approvalResolver: async (envelope) => {
        approvalRequestCount += 1;
        throw new Error(`unexpected bapr approval request: ${envelope.approvalId}`);
      },
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerBodies.push(envelope.body);
          const bodyRecord = envelope.body as { tools?: readonly { type?: string }[] };
          if (bodyRecord.tools?.some((tool) => tool.type === "image_generation")) {
            return {
              output: [{
                id: "ig_auto_test",
                type: "image_generation_call",
                status: "completed",
                revised_prompt: "A tiny generated test image.",
                result: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
              }],
            };
          }
          if (providerBodies.length === 1) {
            return {
              output: [{
                type: "function_call",
                name: "omni.generateImage",
                call_id: "omni-generate-image-auto-call",
                arguments: JSON.stringify({
                  target: {
                    prompt: "Draw a tiny test image without specifying where to save it.",
                    outputFormat: "image/png",
                    size: "1024x1024",
                    quality: "low",
                  },
                  context: { grantedPermissions: ["tool.execute"] },
                }),
              }],
            };
          }
          return { output_text: "图片生成链路已完成。" };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    const sessionId = "session.raxode.generate-image.auto.test";
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: workspace,
      mode: "live",
    });
    assert.equal(start.ok, true);
    const permission = await transport.dispatch({
      type: "application.changePermissionProfile",
      sessionId,
      profile: "bapr",
    });
    assert.equal(permission.ok, true);
    assert.equal(permission.view.permissionProfile, "bapr");

    const result = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "生成一张测试图片，不指定保存路径。",
        cwd: workspace,
      },
    });

    assert.equal(result.ok, true);
    assert.equal(approvalRequestCount, 0);
    const providerBodyText = JSON.stringify(providerBodies);
    assert.match(providerBodyText, /"type":"image_generation"/u);
    assert.match(providerBodyText, /"stream":true/u);
    const artifactDir = path.join(workspace, ".rax_workspace", "artifacts", sessionId);
    const generatedFiles = await readdir(artifactDir);
    assert.equal(generatedFiles.length, 1);
    assert.match(generatedFiles[0] ?? "", /^generated-image-.*\.png$/u);
    const generated = await readFile(path.join(artifactDir, generatedFiles[0] ?? ""));
    assert.equal(generated.byteLength > 0, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode standard approval grants omni.generateImage provider permissions before storage core execution", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-image-generation-approval-"));

  const providerBodies: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "standard",
      now: () => "2026-05-10T00:00:00.000Z",
      approvalResolver: async (envelope) => ({
        status: "approved",
        resolvedBy: "test.approval",
        reason: `approved ${envelope.approvalId}`,
      }),
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerBodies.push(envelope.body);
          const bodyRecord = envelope.body as { tools?: readonly { type?: string }[] };
          if (bodyRecord.tools?.some((tool) => tool.type === "image_generation")) {
            return {
              output: [{
                id: "ig_approval_test",
                type: "image_generation_call",
                status: "completed",
                result: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
              }],
            };
          }
          if (providerBodies.length === 1) {
            return {
              output: [{
                type: "function_call",
                name: "omni.generateImage",
                call_id: "omni-generate-image-approved-call",
                arguments: JSON.stringify({
                  target: {
                    prompt: "Draw a tiny test image after approval.",
                    outputFormat: "image/png",
                    size: "1024x1024",
                  },
                  context: { grantedPermissions: ["tool.execute"] },
                }),
              }],
            };
          }
          return { output_text: "图片生成链路已完成。" };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    const sessionId = "session.raxode.generate-image.approval.test";
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: workspace,
      mode: "live",
    });
    assert.equal(start.ok, true);
    assert.equal(start.view.permissionProfile, "standard");

    const result = await transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "生成一张测试图片，允许审批。",
        cwd: workspace,
      },
    });

    assert.equal(result.ok, true);
    const providerBodyText = JSON.stringify(providerBodies);
    assert.match(providerBodyText, /"type":"image_generation"/u);
    assert.match(providerBodyText, /"stream":true/u);
    const artifactDir = path.join(workspace, ".rax_workspace", "artifacts", sessionId);
    const generatedFiles = await readdir(artifactDir);
    assert.equal(generatedFiles.length, 1);
    const generated = await readFile(path.join(artifactDir, generatedFiles[0] ?? ""));
    assert.equal(generated.byteLength > 0, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode application approval decision resolves a pending runtime approval", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "raxode-image-generation-application-approval-"));

  const providerBodies: unknown[] = [];
  const fakeAuth: AuthEnvelope = {
    kind: "none",
    present: true,
    headerPlan: [],
    queryPlan: [],
    publicSafe: true,
  };

  try {
    const created = await createApplicationProjectRuntime(path.resolve("raxode-cli/backend"), {
      applicationId: "application.raxode.coding",
      mode: "live",
      model: "gpt-5.5",
      reasoningEffort: "low",
      permissionProfile: "standard",
      now: () => "2026-05-10T00:00:00.000Z",
      liveProviderResolver: async () => ({
        auth: fakeAuth,
        providerCaller: async (envelope: OpenAIV1ResponsesRequestEnvelope) => {
          providerBodies.push(envelope.body);
          const bodyRecord = envelope.body as { tools?: readonly { type?: string }[] };
          if (bodyRecord.tools?.some((tool) => tool.type === "image_generation")) {
            return {
              output: [{
                id: "ig_application_approval_test",
                type: "image_generation_call",
                status: "completed",
                result: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
              }],
            };
          }
          if (providerBodies.length === 1) {
            return {
              output: [{
                type: "function_call",
                name: "omni.generateImage",
                call_id: "omni-generate-image-application-approval-call",
                arguments: JSON.stringify({
                  target: {
                    prompt: "Draw a tiny test image after application approval.",
                    outputFormat: "image/png",
                    size: "1024x1024",
                  },
                  context: { grantedPermissions: ["tool.execute"] },
                }),
              }],
            };
          }
          return { output_text: "图片生成链路已完成。" };
        },
      }),
    });
    assert.equal(created.ok, true);
    if (!created.ok) return;

    const transport = createLocalApplicationTransport(created.runtime);
    const sessionId = "session.raxode.generate-image.application-approval.test";
    const start = await transport.dispatch({
      type: "application.start",
      sessionId,
      cwd: workspace,
      mode: "live",
    });
    assert.equal(start.ok, true);
    assert.equal(start.view.permissionProfile, "standard");

    const submitted = transport.dispatch({
      type: "application.submitTurn",
      sessionId,
      mode: "live",
      input: {
        type: "application.input",
        text: "生成一张测试图片，等待 application approval。",
        cwd: workspace,
      },
    });

    let approvalId = "";
    const deadline = Date.now() + 4000;
    while (Date.now() < deadline) {
      const currentView = await transport.getView();
      const pending = currentView.approvals.find((approval) => approval.status === "pending");
      if (pending) {
        approvalId = pending.approvalId;
        assert.equal(pending.feature, "omni");
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.notEqual(approvalId, "");

    const decided = await transport.dispatch({
      type: "application.approvalDecision",
      sessionId,
      approvalId,
      decision: "approve",
      note: "test approval",
    });
    assert.equal(decided.ok, true);

    const result = await submitted;
    assert.equal(result.ok, true);
    const artifactDir = path.join(workspace, ".rax_workspace", "artifacts", sessionId);
    const generatedFiles = await readdir(artifactDir);
    assert.equal(generatedFiles.length, 1);
    const generated = await readFile(path.join(artifactDir, generatedFiles[0] ?? ""));
    assert.equal(generated.byteLength > 0, true);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("raxode backend exposes application REST and WebSocket servers", async () => {
  const rest = await createRaxodeBackendRestServer({
    now: () => "2026-05-10T00:00:00.000Z",
  });
  try {
    const response = await fetch(`${rest.url}/application/view`);
    assert.equal(response.status, 200);
    const view = await response.json() as { applicationId?: string };
    assert.equal(view.applicationId, "application.raxode.coding");
  } finally {
    await rest.close();
  }

  const ws = await createRaxodeBackendWebSocketServer({
    now: () => "2026-05-10T00:00:00.000Z",
  });
  const socket = new WebSocket(ws.url);
  try {
    const ready = await new Promise<Record<string, unknown>>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("timeout waiting for raxode ws ready")), 4000);
      socket.addEventListener("message", (event) => {
        clearTimeout(timeout);
        resolve(JSON.parse(String(event.data)) as Record<string, unknown>);
      }, { once: true });
    });
    assert.equal(ready.type, "application.ready");
  } finally {
    socket.close();
    await ws.close();
  }
});
