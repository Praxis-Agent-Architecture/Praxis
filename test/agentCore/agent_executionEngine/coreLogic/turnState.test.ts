import assert from "node:assert/strict";
import test from "node:test";

import {
  addMainLoopBudgetUsage,
  clearMainLoopOneShotToolContextSelection,
  consumeMainLoopPendingInputs,
  createMainLoopTurnState,
  enqueueMainLoopPendingInput,
  interruptMainLoopTurnState,
  registerMainLoopApprovalWait,
  setMainLoopToolContextSelection,
  transitionMainLoopTurnState,
} from "../../../../src/executionEngine/coreLogic/turnState.js";

test("MainLoopTurnState tracks approval resume, pending input, one-shot tool context, and interrupt checkpoint", () => {
  let state = createMainLoopTurnState({
    sessionId: "session-1",
    turnIndex: 2,
    now: "2026-05-26T00:00:00.000Z",
  });
  state = transitionMainLoopTurnState(state, {
    to: "modelInvoking",
    reason: "test",
    now: "2026-05-26T00:00:01.000Z",
  });
  state = enqueueMainLoopPendingInput(state, {
    inputId: "input-1",
    text: "steer please",
    disposition: "interruptAndRestart",
    now: "2026-05-26T00:00:02.000Z",
  });
  state = setMainLoopToolContextSelection(state, {
    selectionId: "selection-1",
    targetKind: "tool",
    toolId: "file.read",
  });
  state = clearMainLoopOneShotToolContextSelection(state);
  state = registerMainLoopApprovalWait(state, {
    approvalId: "approval-1",
    checkpointRef: "checkpoint-1",
    pendingActionRef: "tool-1",
    now: "2026-05-26T00:00:03.000Z",
  });

  assert.equal(state.phase, "awaitingApproval");
  assert.equal(state.resumeToken?.approvalId, "approval-1");
  assert.equal(state.toolContextSelection, undefined);
  assert.equal(state.pendingInputQueue[0]?.disposition, "interruptAndRestart");

  const consumed = consumeMainLoopPendingInputs(state, "interruptAndRestart");
  assert.equal(consumed.inputs.length, 1);
  assert.equal(consumed.state.pendingInputQueue.length, 0);

  const interrupted = interruptMainLoopTurnState(consumed.state, {
    controlActionId: "control-1",
    cancelTokenId: "cancel-1",
    rollbackPointRef: "rollback-1",
    replayPlanRef: "replay-1",
    reason: "user stop",
    now: "2026-05-26T00:00:04.000Z",
  });
  assert.equal(interrupted.phase, "interrupted");
  assert.equal(interrupted.interruptCheckpoint?.cancelTokenId, "cancel-1");
});

test("addMainLoopBudgetUsage derives total tokens when provider omits totalTokens", () => {
  const state = addMainLoopBudgetUsage(
    createMainLoopTurnState({ sessionId: "session-budget", turnIndex: 0 }),
    { inputTokens: 11, outputTokens: 7 },
  );

  assert.equal(state.budgetUsage.inputTokens, 11);
  assert.equal(state.budgetUsage.outputTokens, 7);
  assert.equal(state.budgetUsage.totalTokens, 18);
});
