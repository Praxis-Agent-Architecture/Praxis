/*
 * 文件定位：Runtime implementation / multiagent mesh plane.
 * 核心目的：定义 project 内 agent-session mesh 的第一版事实契约。
 */

export type MultiagentLifecycleMode = "oneshot" | "persistent";

export type MultiagentSessionStatus = "idle" | "running" | "stopped" | "killed" | "archived";

export type MultiagentMessageIntent = "queue" | "steer";

export type MultiagentMessageStatus = "queued" | "delivered" | "read" | "completed";

export type MultiagentAgentSession = {
  sessionId: string;
  projectId: string;
  agentId: string;
  name?: string;
  description?: string;
  workingDirectory: string;
  lifecycle: MultiagentLifecycleMode;
  status: MultiagentSessionStatus;
  createdAt: string;
  updatedAt: string;
  createdBySessionId?: string;
  derivedFromSessionId?: string;
  appendPrompt?: string;
  model?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type MultiagentMessagePart =
  | { type: "text"; text: string }
  | { type: "json"; value: unknown }
  | { type: "artifact_ref"; artifactId: string }
  | { type: "file_ref"; path: string }
  | { type: "tool_result_ref"; toolCallId: string }
  | { type: "task_request"; task: string }
  | { type: "status_event"; status: string; detail?: string };

export type MultiagentMessage = {
  messageId: string;
  projectId: string;
  fromSessionId: string;
  toSessionId: string;
  intent: MultiagentMessageIntent;
  status: MultiagentMessageStatus;
  parts: readonly MultiagentMessagePart[];
  text: string;
  replyToMessageId?: string;
  completesMessageId?: string;
  createdAt: string;
  readAt?: string;
  completedAt?: string;
  metadata: Readonly<Record<string, unknown>>;
};

export type MultiagentSpawnInput = {
  requesterSessionId: string;
  agentDefinitionId?: string;
  name?: string;
  description?: string;
  model?: string;
  appendPrompt?: string;
  workingDirectory?: string;
  lifecycle?: MultiagentLifecycleMode;
  task: string;
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MultiagentMessageInput = {
  fromSessionId: string;
  toSessionId: string;
  text?: string;
  parts?: readonly MultiagentMessagePart[];
  intent?: MultiagentMessageIntent;
  replyToMessageId?: string;
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MultiagentInboxInput = {
  sessionId: string;
  unreadOnly?: boolean;
  limit?: number;
  now?: string;
};

export type MultiagentListInput = {
  projectId?: string;
  includeInactive?: boolean;
};

export type MultiagentInspectInput = {
  sessionId: string;
};

export type MultiagentWaitInput = {
  requesterSessionId: string;
  messageId: string;
};

export type MultiagentStopInput = {
  sessionId: string;
  reason?: string;
  now?: string;
};

export type MultiagentKillInput = {
  sessionId: string;
  reason?: string;
  now?: string;
};

export type MultiagentEnsureSessionInput = {
  sessionId: string;
  agentId?: string;
  name?: string;
  description?: string;
  workingDirectory?: string;
  lifecycle?: MultiagentLifecycleMode;
  status?: MultiagentSessionStatus;
  now?: string;
  metadata?: Readonly<Record<string, unknown>>;
};

export type MultiagentSpawnResult = {
  session: MultiagentAgentSession;
  initialMessage: MultiagentMessage;
};

export type MultiagentWaitResult = {
  message: MultiagentMessage;
};

export type MultiagentRuntime = {
  ensureSession(input: MultiagentEnsureSessionInput): Promise<MultiagentAgentSession>;
  spawn(input: MultiagentSpawnInput): Promise<MultiagentSpawnResult>;
  message(input: MultiagentMessageInput): Promise<MultiagentMessage>;
  inbox(input: MultiagentInboxInput): Promise<readonly MultiagentMessage[]>;
  list(input?: MultiagentListInput): Promise<readonly MultiagentAgentSession[]>;
  inspect(input: MultiagentInspectInput): Promise<{
    session?: MultiagentAgentSession;
    summary?: string;
    pendingMessages: number;
  }>;
  wait(input: MultiagentWaitInput): Promise<MultiagentWaitResult>;
  stop(input: MultiagentStopInput): Promise<MultiagentAgentSession>;
  kill(input: MultiagentKillInput): Promise<MultiagentAgentSession>;
};
