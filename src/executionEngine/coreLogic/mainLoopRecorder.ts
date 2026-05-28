/*
 * 文件定位：Agent 执行引擎 / MainLoop recorder。
 * 核心目的：把 step、turnState、core event 统一记录为可观察事件流。
 * 边界：提供内存实现和可注入 sink；不直接绑定 runtime store 的具体类。
 */

import type { MainLoopStepRecord } from "./mainLoop.js";
import type { MainLoopCoreEvent, MainLoopRecorderPort } from "./mainLoopPorts.js";
import type { MainLoopTurnState } from "./turnState.js";

export type MainLoopRecorderSnapshot = {
  events: readonly MainLoopCoreEvent[];
  steps: readonly MainLoopStepRecord[];
  turnStates: readonly MainLoopTurnState[];
};

export type MainLoopRecorderSink = Partial<MainLoopRecorderPort>;

export function createMainLoopRecorder(sink: MainLoopRecorderSink = {}): MainLoopRecorderPort & {
  snapshot: () => MainLoopRecorderSnapshot;
} {
  const events: MainLoopCoreEvent[] = [];
  const steps: MainLoopStepRecord[] = [];
  const turnStates: MainLoopTurnState[] = [];
  return {
    async recordEvent(event) {
      events.push(event);
      await sink.recordEvent?.(event);
    },
    async recordStep(step) {
      steps.push(step);
      await sink.recordStep?.(step);
    },
    async recordTurnState(state) {
      turnStates.push(state);
      await sink.recordTurnState?.(state);
    },
    snapshot() {
      return {
        events: [...events],
        steps: [...steps],
        turnStates: [...turnStates],
      };
    },
  };
}

export function createMainLoopCoreEvent(input: {
  name: MainLoopCoreEvent["name"];
  sessionId: string;
  turnId?: string;
  turnIndex?: number;
  now?: string;
  payload?: Readonly<Record<string, unknown>>;
  metadata?: Readonly<Record<string, unknown>>;
}): MainLoopCoreEvent {
  const createdAt = input.now ?? new Date().toISOString();
  return {
    eventId: `${input.sessionId}:event:${input.name}:${createdAt}:${Math.random().toString(36).slice(2, 8)}`,
    name: input.name,
    sessionId: input.sessionId,
    turnId: input.turnId,
    turnIndex: input.turnIndex,
    createdAt,
    payload: input.payload ?? {},
    metadata: input.metadata ?? {},
  };
}
