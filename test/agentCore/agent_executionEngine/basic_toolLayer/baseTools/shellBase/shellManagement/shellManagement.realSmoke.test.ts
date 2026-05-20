import assert from "node:assert/strict";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import test from "node:test";

import type { BaseToolExecutorPort } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolExecutorPort.js";
import { createBaseToolRegistry } from "../../../../../../../src/executionEngine/basic_toolLayer/baseTools/baseToolRegistry.js";

type ManagedSession = {
  sessionId: string;
  shellType: "sh" | "bash" | "zsh";
  workingDirectory?: string;
  state: "active" | "suspended" | "closed" | "detached";
  process: ChildProcessWithoutNullStreams;
  priority: number;
  exitCode?: number;
  exitSignal?: NodeJS.Signals;
};

class RuntimeOwnedShellManagementHarness {
  readonly sessions = new Map<string, ManagedSession>();
  readonly resourceReservations = new Map<string, number>();
  nextSessionNumber = 1;

  get executor(): BaseToolExecutorPort {
    return {
      shell: {
        manageLifecycle: async ({ target }) => this.manageLifecycle(target),
        manageSession: async ({ target }) => this.manageSession(target),
        manageProcess: async ({ target }) => this.manageProcess(target),
        manageResource: async ({ target }) => this.manageResource(target),
      },
    };
  }

  cleanup(): void {
    for (const session of this.sessions.values()) {
      if (session.state !== "closed") {
        session.process.kill("SIGTERM");
        session.state = "closed";
      }
    }
  }

  private manageLifecycle(target: Readonly<Record<string, unknown>>) {
    const action = this.readString(target.action);
    if (action === "create") {
      const session = this.createSession({
        sessionId: this.optionalString(target.sessionId) ?? `managed-shell-${this.nextSessionNumber++}`,
        shellType: this.readShell(target.shellType),
        workingDirectory: this.optionalString(target.workingDirectory),
      });
      return this.ok({
        sessionId: session.sessionId,
        shellType: session.shellType,
        workingDirectory: session.workingDirectory,
        plannedState: "active",
        lifecycleChangeBlocked: false,
        resultEnvelope: {
          planned: false,
          sessionHandle: session.sessionId,
          processId: session.process.pid,
          state: session.state,
        },
      });
    }

    const session = this.requireSession(this.readString(target.sessionId));
    if (action === "suspend") session.state = "suspended";
    if (action === "resume" || action === "attach") session.state = "active";
    if (action === "close") this.closeSession(session);
    return this.ok({
      sessionId: session.sessionId,
      plannedState: session.state,
      lifecycleChangeBlocked: false,
      resultEnvelope: {
        planned: false,
        sessionHandle: session.sessionId,
        processId: session.process.pid,
        state: session.state,
      },
    });
  }

  private manageSession(target: Readonly<Record<string, unknown>>) {
    const action = this.optionalString(target.action) ?? "inspect";
    const session =
      action === "create"
        ? this.createSession({
            sessionId: this.optionalString(target.sessionId) ?? `managed-shell-${this.nextSessionNumber++}`,
            shellType: this.readShell(target.shellType),
            workingDirectory: this.optionalString(target.workingDirectory),
          })
        : this.requireSession(this.readString(target.sessionId));

    if (action === "attach") session.state = "active";
    if (action === "detach") session.state = "detached";
    if (action === "close") this.closeSession(session);

    return this.ok({
      target: {
        action,
        sessionId: session.sessionId,
        shellType: session.shellType,
        workingDirectory: session.workingDirectory,
      },
      executionBlocked: false,
      sessionEnvelope: {
        operation: action,
        runtimeSessionState: session.state,
        sessionId: session.sessionId,
        processId: session.process.pid,
      },
    });
  }

  private manageProcess(target: Readonly<Record<string, unknown>>) {
    const action = this.readString(target.action);
    const session = this.requireProcessTarget(target);
    if (action === "prioritize") {
      session.priority = this.readNumber(target.priority);
    }
    if (action === "signal") {
      const signal = this.readString(target.signal) as NodeJS.Signals;
      const signaled = session.process.kill(signal);
      if (signal === "SIGTERM" || signal === "SIGKILL") session.state = "closed";
      return this.ok({
        processId: session.process.pid,
        sessionId: session.sessionId,
        priority: session.priority,
        processChangeBlocked: false,
        resultEnvelope: {
          planned: false,
          processId: session.process.pid,
          sessionId: session.sessionId,
          observedStatus: "signaled",
          signal,
          signaled,
        },
      });
    }
    if (action === "reap") {
      this.closeSession(session);
    }

    return this.ok({
      processId: session.process.pid,
      sessionId: session.sessionId,
      priority: session.priority,
      processChangeBlocked: false,
      resultEnvelope: {
        planned: false,
        processId: session.process.pid,
        sessionId: session.sessionId,
        observedStatus: session.state === "closed" ? "closed" : "running",
        priority: session.priority,
      },
    });
  }

  private manageResource(target: Readonly<Record<string, unknown>>) {
    const action = this.optionalString(target.action) ?? "inspect";
    const resourceKind = this.readString(target.resourceKind);
    const resourceId = this.optionalString(target.resourceId) ?? `${resourceKind}:default`;
    const amount = typeof target.amount === "number" ? target.amount : 1;
    const existing = this.resourceReservations.get(resourceId) ?? 0;
    if (action === "reserve") this.resourceReservations.set(resourceId, existing + amount);
    if (action === "release") this.resourceReservations.set(resourceId, Math.max(0, existing - amount));
    if (action === "adjust-limit") this.resourceReservations.set(resourceId, this.readNumber(target.limitValue));

    return this.ok({
      executionBlocked: false,
      resourceEnvelope: {
        operation: action,
        resourceKind,
        resourceId,
        allocationDelta: action === "reserve" ? amount : action === "release" ? -amount : 0,
        currentAmount: this.resourceReservations.get(resourceId) ?? 0,
      },
    });
  }

  private createSession(input: { sessionId: string; shellType: "sh" | "bash" | "zsh"; workingDirectory?: string }): ManagedSession {
    const child = spawn(process.execPath, ["-e", "process.stdin.resume(); setInterval(() => {}, 1000);"], {
      cwd: input.workingDirectory,
    });
    const session: ManagedSession = {
      sessionId: input.sessionId,
      shellType: input.shellType,
      workingDirectory: input.workingDirectory,
      state: "active",
      process: child,
      priority: 0,
    };
    child.on("exit", (code, signal) => {
      session.state = "closed";
      session.exitCode = code ?? undefined;
      session.exitSignal = signal ?? undefined;
    });
    this.sessions.set(session.sessionId, session);
    return session;
  }

  private closeSession(session: ManagedSession): void {
    if (session.state !== "closed") {
      session.process.kill("SIGTERM");
      session.state = "closed";
    }
  }

  private requireProcessTarget(target: Readonly<Record<string, unknown>>): ManagedSession {
    if (typeof target.sessionId === "string") return this.requireSession(target.sessionId);
    const processId = this.readNumber(target.processId);
    for (const session of this.sessions.values()) {
      if (session.process.pid === processId) return session;
    }
    throw new Error(`unknown managed process ${processId}`);
  }

  private requireSession(sessionId: string): ManagedSession {
    const session = this.sessions.get(sessionId);
    if (session === undefined) throw new Error(`unknown managed shell session ${sessionId}`);
    return session;
  }

  private ok(output: Readonly<Record<string, unknown>>) {
    return { ok: true as const, output };
  }

  private readShell(value: unknown): "sh" | "bash" | "zsh" {
    if (value === "bash" || value === "zsh" || value === "sh") return value;
    return "sh";
  }

  private readString(value: unknown): string {
    if (typeof value !== "string" || value.trim().length === 0) throw new TypeError("expected non-empty string runtime target field");
    return value;
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.trim().length > 0 ? value : undefined;
  }

  private readNumber(value: unknown): number {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError("expected numeric runtime target field");
    return value;
  }

  async waitForProcessExit(sessionId: string, timeoutMs = 3000): Promise<ManagedSession> {
    const session = this.requireSession(sessionId);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (session.exitCode !== undefined || session.exitSignal !== undefined) return session;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail(`timed out waiting for managed shell session ${sessionId} to exit`);
  }
}

async function invokeTool(toolId: string, input: unknown, executor: BaseToolExecutorPort) {
  const lookup = createBaseToolRegistry().lookupHandler(toolId);
  assert.equal(lookup.ok, true);
  if (!lookup.ok) throw new Error(`missing handler ${toolId}`);

  const result = await lookup.handler.invoke({
    toolCallId: `${toolId}:real-smoke`,
    runtimeId: "runtime-real-shell-management",
    sessionId: "agent-session-real-shell-management",
    input,
    executor,
  });
  if (!result.ok) throw new Error(`${toolId} failed: ${result.error.code}`);
  return result;
}

test("shellManagement tools can manage a runtime-owned shell session, process, and resources through registry", async () => {
  const harness = new RuntimeOwnedShellManagementHarness();
  const guarded = { dryRun: false, guard: { allowed: true } };

  try {
    const lifecycleCreate = await invokeTool(
      "shell.shellLifecycleManagement",
      {
        target: { action: "create", shellType: "sh" },
        context: { ...guarded, grantedPermissions: ["shell:lifecycle:manage"] },
      },
      harness.executor,
    );
    const lifecycleOutput = lifecycleCreate.output as {
      sessionId: string;
      dryRun: boolean;
      providerCalled: boolean;
      resultEnvelope: { processId: number; state: string };
    };
    assert.equal(lifecycleOutput.dryRun, false);
    assert.equal(lifecycleOutput.providerCalled, true);
    assert.equal(lifecycleOutput.resultEnvelope.state, "active");
    assert.equal(typeof lifecycleOutput.resultEnvelope.processId, "number");

    const sessionId = lifecycleOutput.sessionId;
    const processId = lifecycleOutput.resultEnvelope.processId;
    const sessionScope = { allowedSessionIds: [sessionId] };
    const processScope = { allowedSessionIds: [sessionId], allowedProcessIds: [processId] };

    const sessionInspect = await invokeTool(
      "shell.shellSessionManagement",
      {
        target: { action: "inspect", sessionId },
        context: { ...guarded, ...sessionScope, grantedPermissions: ["shell:session:inspect"] },
      },
      harness.executor,
    );
    assert.equal((sessionInspect.output as { providerCalled: boolean }).providerCalled, true);
    assert.equal((sessionInspect.output as { sessionEnvelope: { runtimeSessionState: string } }).sessionEnvelope.runtimeSessionState, "active");

    const lifecycleSuspend = await invokeTool(
      "shell.shellLifecycleManagement",
      {
        target: { action: "suspend", sessionId },
        context: { ...guarded, ...sessionScope, grantedPermissions: ["shell:lifecycle:manage"] },
      },
      harness.executor,
    );
    assert.equal((lifecycleSuspend.output as { resultEnvelope: { state: string } }).resultEnvelope.state, "suspended");

    const lifecycleResume = await invokeTool(
      "shell.shellLifecycleManagement",
      {
        target: { action: "resume", sessionId },
        context: { ...guarded, ...sessionScope, grantedPermissions: ["shell:lifecycle:manage"] },
      },
      harness.executor,
    );
    assert.equal((lifecycleResume.output as { resultEnvelope: { state: string } }).resultEnvelope.state, "active");

    const resourceReserve = await invokeTool(
      "shell.shellResourceManagement",
      {
        target: { action: "reserve", resourceKind: "pty", resourceId: `pty:${sessionId}`, amount: 1 },
        context: { ...guarded, allowedResourceIds: [`pty:${sessionId}`], grantedPermissions: ["shell:resource:reserve"] },
      },
      harness.executor,
    );
    assert.equal((resourceReserve.output as { providerCalled: boolean }).providerCalled, true);
    assert.equal((resourceReserve.output as { resourceEnvelope: { currentAmount: number } }).resourceEnvelope.currentAmount, 1);

    const processInspect = await invokeTool(
      "shell.shellProcessManagement",
      {
        target: { action: "inspect", sessionId, processId },
        context: { ...guarded, ...processScope, grantedPermissions: ["shell:process:manage"] },
      },
      harness.executor,
    );
    assert.equal((processInspect.output as { providerCalled: boolean }).providerCalled, true);
    assert.equal((processInspect.output as { resultEnvelope: { observedStatus: string } }).resultEnvelope.observedStatus, "running");

    const prioritize = await invokeTool(
      "shell.shellProcessManagement",
      {
        target: { action: "prioritize", sessionId, processId, priority: 5 },
        context: { ...guarded, ...processScope, grantedPermissions: ["shell:process:manage"] },
      },
      harness.executor,
    );
    assert.equal((prioritize.output as { resultEnvelope: { priority: number } }).resultEnvelope.priority, 5);

    const detach = await invokeTool(
      "shell.shellSessionManagement",
      {
        target: { action: "detach", sessionId },
        context: { ...guarded, ...sessionScope, grantedPermissions: ["shell:session:attach"] },
      },
      harness.executor,
    );
    assert.equal((detach.output as { sessionEnvelope: { runtimeSessionState: string } }).sessionEnvelope.runtimeSessionState, "detached");

    const attach = await invokeTool(
      "shell.shellSessionManagement",
      {
        target: { action: "attach", sessionId },
        context: { ...guarded, ...sessionScope, grantedPermissions: ["shell:session:attach"] },
      },
      harness.executor,
    );
    assert.equal((attach.output as { sessionEnvelope: { runtimeSessionState: string } }).sessionEnvelope.runtimeSessionState, "active");

    const signal = await invokeTool(
      "shell.shellProcessManagement",
      {
        target: { action: "signal", sessionId, processId, signal: "SIGTERM", reason: "real smoke cleanup" },
        context: {
          ...guarded,
          ...processScope,
          grantedPermissions: ["shell:process:manage"],
        },
      },
      harness.executor,
    );
    assert.equal((signal.output as { resultEnvelope: { signaled: boolean; signal: string } }).resultEnvelope.signaled, true);
    assert.equal((signal.output as { resultEnvelope: { signaled: boolean; signal: string } }).resultEnvelope.signal, "SIGTERM");
    const exitedSession = await harness.waitForProcessExit(sessionId);
    assert.equal(exitedSession.exitSignal, "SIGTERM");

    const lifecycleClose = await invokeTool(
      "shell.shellLifecycleManagement",
      {
        target: { action: "close", sessionId },
        context: {
          ...guarded,
          ...sessionScope,
          grantedPermissions: ["shell:lifecycle:manage"],
        },
      },
      harness.executor,
    );
    assert.equal((lifecycleClose.output as { resultEnvelope: { state: string } }).resultEnvelope.state, "closed");

    const resourceRelease = await invokeTool(
      "shell.shellResourceManagement",
      {
        target: { action: "release", resourceKind: "pty", resourceId: `pty:${sessionId}`, amount: 1 },
        context: { ...guarded, allowedResourceIds: [`pty:${sessionId}`], grantedPermissions: ["shell:resource:release"] },
      },
      harness.executor,
    );
    assert.equal((resourceRelease.output as { resourceEnvelope: { currentAmount: number } }).resourceEnvelope.currentAmount, 0);
  } finally {
    harness.cleanup();
  }
});
