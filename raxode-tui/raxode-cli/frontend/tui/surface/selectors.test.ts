import { strict as assert } from "node:assert";
import test from "node:test";

import { selectTranscriptMessages } from "./selectors.js";
import { createSurfaceAppState, createSurfaceMessage, createSurfaceTurn } from "./types.js";

test("selectTranscriptMessages hides tool previews once the matching final summary arrives", () => {
  const state = createSurfaceAppState({
    turns: [createSurfaceTurn({ turnId: "turn-1", turnIndex: 1 })],
    messages: [
      createSurfaceMessage({
        messageId: "tool-preview:turn-1:call-1",
        kind: "status",
        text: "Code composing\nApplying patch",
        createdAt: "2026-05-27T00:00:00.000Z",
        turnId: "turn-1",
        metadata: {
          source: "tool_summary",
          familyKey: "code",
          summaryRole: "tool_preview",
          summaryState: "active",
          toolCallId: "call-1",
        },
      }),
      createSurfaceMessage({
        messageId: "tool-family:turn-1:call-1",
        kind: "status",
        text: "File\npatch.apply completed",
        createdAt: "2026-05-27T00:00:01.000Z",
        turnId: "turn-1",
        metadata: {
          source: "tool_summary",
          familyKey: "file",
          summaryRole: "family",
          summaryState: "idle",
          resultMetadata: {
            toolCallId: "call-1",
          },
        },
      }),
    ],
  });

  assert.deepEqual(
    selectTranscriptMessages(state).map((message) => message.messageId),
    ["tool-family:turn-1:call-1"],
  );
});
