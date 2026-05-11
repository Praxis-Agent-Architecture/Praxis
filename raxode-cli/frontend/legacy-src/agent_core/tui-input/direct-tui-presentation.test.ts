import assert from "node:assert/strict";
import test from "node:test";

import {
  startTextSelection,
  updateTextSelection,
} from "../../../tui-input/selection.js";
import { createSurfaceMessage } from "../surface/types.js";
import {
  applyDirectTuiTextSelectionToRenderSegments,
  createDirectTuiCmpActivityKey,
  deriveDirectTuiCmpStatusDescriptor,
  hasDirectTuiFormalConversation,
  isDirectTuiCmpActivityStage,
  mergeDirectTuiStreamingAssistantLine,
  resolveDirectTuiAssistantDeltaAction,
  resolveDirectTuiAssistantTurnResultAction,
  resolveDirectTuiComposerSelectionTopRow,
  resolveDirectTuiConversationPhase,
  shouldBreakDirectTuiAssistantSegmentOnStageStart,
  shouldRenderDirectTuiConversationHeader,
} from "./direct-tui-presentation.js";

test("formal conversation starts only after a real user message appears", () => {
  const startupOnly = [
    createSurfaceMessage({
      messageId: "status:1",
      kind: "status",
      text: "warming up",
      createdAt: "2026-04-14T00:00:00.000Z",
    }),
    createSurfaceMessage({
      messageId: "assistant:welcome",
      kind: "assistant",
      text: "hello there",
      createdAt: "2026-04-14T00:00:01.000Z",
    }),
  ];
  assert.equal(hasDirectTuiFormalConversation(startupOnly), false);
  assert.equal(resolveDirectTuiConversationPhase({
    conversationActivated: false,
    messages: startupOnly,
  }), "intro");

  const withUser = [
    ...startupOnly,
    createSurfaceMessage({
      messageId: "user:1",
      kind: "user",
      text: "你好",
      createdAt: "2026-04-14T00:00:02.000Z",
    }),
  ];
  assert.equal(hasDirectTuiFormalConversation(withUser), true);
  assert.equal(resolveDirectTuiConversationPhase({
    conversationActivated: false,
    messages: withUser,
  }), "conversation");
});

test("conversation phase can activate immediately after submit before transcript catches up", () => {
  assert.equal(resolveDirectTuiConversationPhase({
    conversationActivated: true,
    messages: [],
  }), "conversation");
});

test("conversation header lives in the scrollable transcript instead of a fixed masthead", () => {
  assert.equal(shouldRenderDirectTuiConversationHeader({
    conversationActivated: false,
    messages: [],
    pendingSessionSwitch: false,
  }), true);

  assert.equal(shouldRenderDirectTuiConversationHeader({
    conversationActivated: true,
    messages: [],
    pendingSessionSwitch: false,
  }), false);

  assert.equal(shouldRenderDirectTuiConversationHeader({
    conversationActivated: true,
    messages: [
      createSurfaceMessage({
        messageId: "user:1",
        kind: "user",
        text: "你好",
        createdAt: "2026-04-14T00:00:02.000Z",
      }),
    ],
    pendingSessionSwitch: false,
  }), true);

  assert.equal(shouldRenderDirectTuiConversationHeader({
    conversationActivated: false,
    messages: [
      createSurfaceMessage({
        messageId: "user:2",
        kind: "user",
        text: "继续",
        createdAt: "2026-04-14T00:00:03.000Z",
      }),
    ],
    pendingSessionSwitch: true,
  }), false);
});

test("turn_result updates the active assistant message instead of appending a second segment", () => {
  assert.deepEqual(resolveDirectTuiAssistantTurnResultAction({
    finalAnswer: "你好！我是 Praxis Core。",
    streamedText: "你好！我是 Praxis Core，",
    activeMessageId: "assistant:turn-1:1",
  }), {
    kind: "update",
    text: "你好！我是 Praxis Core。",
    messageId: "assistant:turn-1:1",
  });
});

test("turn_result appends only when there was no streamed assistant message", () => {
  assert.deepEqual(resolveDirectTuiAssistantTurnResultAction({
    finalAnswer: "完整答案",
    streamedText: "",
  }), {
    kind: "append",
    text: "完整答案",
  });
});

test("turn_result is a noop when the final answer already matches streamed text", () => {
  assert.deepEqual(resolveDirectTuiAssistantTurnResultAction({
    finalAnswer: "最终一致",
    streamedText: "最终一致",
    activeMessageId: "assistant:turn-2:1",
  }), {
    kind: "noop",
  });
});

test("assistant delta resumes after a tool break with only the unseen suffix", () => {
  assert.deepEqual(resolveDirectTuiAssistantDeltaAction({
    decodedText: "当然可以。简要说，我是一个偏执行型的 AI 助手。",
    previousDisplayedText: "当然可以。",
  }), {
    kind: "append",
    text: "简要说，我是一个偏执行型的 AI 助手。",
  });
});

test("assistant delta appends a normal incremental chunk to the active segment", () => {
  assert.deepEqual(resolveDirectTuiAssistantDeltaAction({
    decodedText: "当然可以。简要说，",
    previousDisplayedText: "当然可以。",
    activeMessageId: "assistant:turn-2:1",
  }), {
    kind: "delta",
    textDelta: "简要说，",
    messageId: "assistant:turn-2:1",
  });
});

test("assistant delta falls back to update when the accumulated text rewrites earlier content", () => {
  assert.deepEqual(resolveDirectTuiAssistantDeltaAction({
    decodedText: "新的完整答案",
    previousDisplayedText: "旧的前缀",
    activeMessageId: "assistant:turn-2:1",
  }), {
    kind: "update",
    text: "新的完整答案",
    messageId: "assistant:turn-2:1",
  });
});

test("streaming assistant line is rendered separately from committed transcript", () => {
  const transcriptLines = [">> 写一段话", "", "● 已完成上一轮", ""];

  assert.deepEqual(mergeDirectTuiStreamingAssistantLine({
    transcriptLines,
    streamingAssistant: {
      messageId: "assistant:turn-2:1",
      turnId: "turn-2",
      text: "正在流式输出",
    },
  }), [">> 写一段话", "", "● 已完成上一轮", "", "● 正在流式输出", ""]);

  assert.deepEqual(mergeDirectTuiStreamingAssistantLine({
    transcriptLines,
    streamingAssistant: null,
  }), transcriptLines);
});

test("background cmp stages do not break an in-flight assistant segment", () => {
  assert.equal(shouldBreakDirectTuiAssistantSegmentOnStageStart("cmp/icma"), false);
  assert.equal(shouldBreakDirectTuiAssistantSegmentOnStageStart("cmp/dbagent"), false);
  assert.equal(shouldBreakDirectTuiAssistantSegmentOnStageStart("core/run"), false);
});

test("foreground tool stages still break assistant segments by default", () => {
  assert.equal(shouldBreakDirectTuiAssistantSegmentOnStageStart("core/capability_bridge"), true);
  assert.equal(shouldBreakDirectTuiAssistantSegmentOnStageStart("workspace/readback"), true);
  assert.equal(shouldBreakDirectTuiAssistantSegmentOnStageStart(undefined), true);
});

test("cmp activity stage detection excludes infra bootstrap", () => {
  assert.equal(isDirectTuiCmpActivityStage("cmp/icma"), true);
  assert.equal(isDirectTuiCmpActivityStage("cmp/dispatcher"), true);
  assert.equal(isDirectTuiCmpActivityStage("cmp/infra_bootstrap"), false);
  assert.equal(isDirectTuiCmpActivityStage("core/run"), false);
});

test("cmp activity keys are created only for real cmp execution stages", () => {
  assert.equal(createDirectTuiCmpActivityKey({
    turnIndex: 11,
    stage: "cmp/checker",
  }), "11:cmp/checker");
  assert.equal(createDirectTuiCmpActivityKey({
    turnIndex: 11,
    stage: "cmp/infra_bootstrap",
  }), null);
});

test("cmp status descriptor animates only for active cmp stages", () => {
  assert.deepEqual(deriveDirectTuiCmpStatusDescriptor({
    activeStage: "cmp/icma",
  }), {
    label: "CMP icma running",
    animated: true,
    tone: "active",
  });
});

test("cmp status descriptor surfaces degraded readback without pretending it is running", () => {
  assert.deepEqual(deriveDirectTuiCmpStatusDescriptor({
    snapshot: {
      status: "degraded",
      readbackStatus: "degraded",
    },
  }), {
    label: "CMP readback degraded",
    animated: false,
    tone: "warning",
  });
});

test("cmp status descriptor distinguishes ready empty from active work", () => {
  assert.deepEqual(deriveDirectTuiCmpStatusDescriptor({
    snapshot: {
      status: "empty",
      readbackStatus: "ready",
    },
  }), {
    label: "CMP ready but empty",
    animated: false,
    tone: "muted",
  });
});

test("text selection render segments preserve colors while applying selection background", () => {
  const selection = updateTextSelection(
    startTextSelection("transcript", { row: 0, column: 1 }),
    "transcript",
    { row: 0, column: 4 },
  );

  assert.deepEqual(applyDirectTuiTextSelectionToRenderSegments({
    text: "abcdef",
    segments: [
      { text: "ab", color: "white" },
      { text: "cd", color: "cyan" },
      { text: "ef", color: "green" },
    ],
    row: 0,
    scope: "transcript",
    selection,
    selectionBackgroundColor: "blue",
  }), [
    { text: "a", color: "white", backgroundColor: undefined },
    { text: "b", color: "white", backgroundColor: "blue" },
    { text: "cd", color: "cyan", backgroundColor: "blue" },
    { text: "e", color: "green", backgroundColor: "blue" },
    { text: "f", color: "green", backgroundColor: undefined },
  ]);
});

test("text selection render segments ignore selections from another scope", () => {
  const selection = updateTextSelection(
    startTextSelection("composer", { row: 0, column: 0 }),
    "composer",
    { row: 0, column: 3 },
  );

  assert.deepEqual(applyDirectTuiTextSelectionToRenderSegments({
    text: "abcdef",
    segments: [{ text: "abcdef", color: "white" }],
    row: 0,
    scope: "transcript",
    selection,
    selectionBackgroundColor: "blue",
  }), [{ text: "abcdef", color: "white" }]);
});

test("composer selection top row follows slash panels and dispatch previews", () => {
  assert.equal(resolveDirectTuiComposerSelectionTopRow({
    transcriptViewportLineCount: 20,
    overlayLineCount: 0,
    pendingPreviewLineCount: 0,
  }), 23);

  assert.equal(resolveDirectTuiComposerSelectionTopRow({
    transcriptViewportLineCount: 20,
    overlayLineCount: 5,
    pendingPreviewLineCount: 2,
  }), 30);
});
