import stringWidth from "string-width";

import {
  getSelectionColumnsForRow,
  splitTextBySelectionColumns,
  type TextSelectionScope,
  type TextSelectionState,
} from "../../../tui-input/selection.js";
import type { SurfaceMessage } from "../surface/types.js";

export type DirectTuiConversationPhase = "intro" | "conversation";

export function hasDirectTuiFormalConversation(
  messages: readonly Pick<SurfaceMessage, "kind">[],
): boolean {
  return messages.some((message) => message.kind === "user");
}

export function resolveDirectTuiConversationPhase(input: {
  conversationActivated: boolean;
  messages: readonly Pick<SurfaceMessage, "kind">[];
}): DirectTuiConversationPhase {
  if (input.conversationActivated || hasDirectTuiFormalConversation(input.messages)) {
    return "conversation";
  }
  return "intro";
}

export function shouldRenderDirectTuiConversationHeader(input: {
  conversationActivated: boolean;
  messages: readonly Pick<SurfaceMessage, "kind">[];
  pendingSessionSwitch: boolean;
}): boolean {
  if (input.pendingSessionSwitch) {
    return false;
  }
  return resolveDirectTuiConversationPhase({
    conversationActivated: input.conversationActivated,
    messages: input.messages,
  }) === "intro" || input.messages.length > 0;
}

export function shouldBreakDirectTuiAssistantSegmentOnStageStart(stage?: string | null): boolean {
  const normalizedStage = stage?.trim();
  if (!normalizedStage) {
    return true;
  }
  if (normalizedStage === "core/run") {
    return false;
  }
  if (normalizedStage === "core/model.infer") {
    return false;
  }
  if (normalizedStage.startsWith("cmp/")) {
    return false;
  }
  return true;
}

export function isDirectTuiCmpActivityStage(stage?: string | null): boolean {
  const normalizedStage = stage?.trim();
  if (!normalizedStage || !normalizedStage.startsWith("cmp/")) {
    return false;
  }
  return normalizedStage !== "cmp/infra_bootstrap";
}

export function createDirectTuiCmpActivityKey(input: {
  turnIndex?: number | null;
  stage?: string | null;
}): string | null {
  if (!isDirectTuiCmpActivityStage(input.stage)) {
    return null;
  }
  const normalizedTurnIndex = typeof input.turnIndex === "number" && Number.isFinite(input.turnIndex)
    ? input.turnIndex
    : 0;
  return `${normalizedTurnIndex}:${input.stage?.trim()}`;
}

export interface DirectTuiCmpStatusDescriptor {
  label: string;
  animated: boolean;
  tone: "muted" | "active" | "warning" | "danger";
}

export function deriveDirectTuiCmpStatusDescriptor(input: {
  activeStage?: string | null;
  snapshot?: {
    status?: string;
    readbackStatus?: string;
    emptyReason?: string;
  } | null;
}): DirectTuiCmpStatusDescriptor {
  const activeStage = input.activeStage?.trim();
  if (activeStage) {
    return {
      label: `CMP ${activeStage.replace(/^cmp\//u, "")} running`,
      animated: true,
      tone: "active",
    };
  }

  const readbackStatus = input.snapshot?.readbackStatus?.trim().toLowerCase();
  const status = input.snapshot?.status?.trim().toLowerCase();
  if (readbackStatus === "failed" || status === "failed") {
    return {
      label: "CMP readback failed",
      animated: false,
      tone: "danger",
    };
  }
  if (readbackStatus === "degraded" || status === "degraded") {
    return {
      label: "CMP readback degraded",
      animated: false,
      tone: "warning",
    };
  }
  if (readbackStatus === "ready" && status === "empty") {
    return {
      label: "CMP ready but empty",
      animated: false,
      tone: "muted",
    };
  }
  if (readbackStatus === "ready" || status === "ready") {
    return {
      label: "CMP ready",
      animated: false,
      tone: "muted",
    };
  }
  if (status === "booting") {
    return {
      label: "CMP warming up",
      animated: false,
      tone: "muted",
    };
  }
  return {
    label: "CMP status pending",
    animated: false,
    tone: "muted",
  };
}

export interface DirectTuiTextSelectionSegment {
  text: string;
  backgroundColor?: string;
}

export function applyDirectTuiTextSelectionToRenderSegments<
  TSegment extends DirectTuiTextSelectionSegment,
>(input: {
  text: string;
  segments?: readonly TSegment[];
  row: number;
  scope: TextSelectionScope;
  selection: TextSelectionState | null;
  selectionBackgroundColor: string;
}): TSegment[] | undefined {
  if (input.selection?.scope !== input.scope) {
    return input.segments ? [...input.segments] : undefined;
  }
  const lineWidth = Math.max(1, stringWidth(input.text));
  const range = getSelectionColumnsForRow(input.selection, input.row, lineWidth);
  if (!range || range.endColumnExclusive <= range.startColumn) {
    return input.segments ? [...input.segments] : undefined;
  }
  const sourceSegments: readonly TSegment[] = input.segments?.length
    ? input.segments
    : ([{ text: input.text }] as TSegment[]);
  const output: TSegment[] = [];
  let segmentColumn = 0;
  for (const segment of sourceSegments) {
    for (const piece of splitTextBySelectionColumns(segment.text, range, segmentColumn)) {
      output.push({
        ...segment,
        text: piece.text,
        backgroundColor: piece.selected ? input.selectionBackgroundColor : segment.backgroundColor,
      });
    }
    segmentColumn += stringWidth(segment.text);
  }
  return output;
}

export function resolveDirectTuiComposerSelectionTopRow(input: {
  transcriptViewportLineCount: number;
  overlayLineCount: number;
  pendingPreviewLineCount: number;
}): number {
  return Math.max(0, input.transcriptViewportLineCount)
    + 3
    + Math.max(0, input.overlayLineCount)
    + Math.max(0, input.pendingPreviewLineCount);
}

export type DirectTuiAssistantTurnResultAction =
  | { kind: "noop" }
  | { kind: "append"; text: string }
  | { kind: "update"; text: string; messageId: string };

export type DirectTuiAssistantDeltaAction =
  | { kind: "noop" }
  | { kind: "append"; text: string }
  | { kind: "delta"; textDelta: string; messageId: string }
  | { kind: "update"; text: string; messageId: string };

export interface DirectTuiStreamingAssistantText {
  messageId: string;
  turnId: string;
  text: string;
}

export function mergeDirectTuiStreamingAssistantLine(input: {
  transcriptLines: readonly string[];
  streamingAssistant?: DirectTuiStreamingAssistantText | null;
}): string[] {
  if (!input.streamingAssistant?.text) {
    return [...input.transcriptLines];
  }
  return [
    ...input.transcriptLines,
    `● ${input.streamingAssistant.text}`,
    "",
  ];
}

export function resolveDirectTuiAssistantDeltaAction(input: {
  decodedText: string;
  previousDisplayedText: string;
  activeMessageId?: string;
}): DirectTuiAssistantDeltaAction {
  if (!input.activeMessageId) {
    if (input.previousDisplayedText.length > 0 && input.decodedText.startsWith(input.previousDisplayedText)) {
      const textDelta = input.decodedText.slice(input.previousDisplayedText.length);
      if (!textDelta) {
        return { kind: "noop" };
      }
      return {
        kind: "append",
        text: textDelta,
      };
    }
    if (!input.decodedText) {
      return { kind: "noop" };
    }
    return {
      kind: "append",
      text: input.decodedText,
    };
  }
  if (!input.decodedText.startsWith(input.previousDisplayedText)) {
    return {
      kind: "update",
      text: input.decodedText,
      messageId: input.activeMessageId,
    };
  }
  const textDelta = input.decodedText.slice(input.previousDisplayedText.length);
  if (!textDelta) {
    return { kind: "noop" };
  }
  return {
    kind: "delta",
    textDelta,
    messageId: input.activeMessageId,
  };
}

export function resolveDirectTuiAssistantTurnResultAction(input: {
  finalAnswer: string | null;
  streamedText: string;
  activeMessageId?: string;
}): DirectTuiAssistantTurnResultAction {
  if (!input.finalAnswer) {
    return { kind: "noop" };
  }
  if (!input.activeMessageId) {
    if (input.streamedText.length > 0) {
      return { kind: "noop" };
    }
    return {
      kind: "append",
      text: input.finalAnswer,
    };
  }
  if (input.finalAnswer === input.streamedText) {
    return { kind: "noop" };
  }
  return {
    kind: "update",
    text: input.finalAnswer,
    messageId: input.activeMessageId,
  };
}
