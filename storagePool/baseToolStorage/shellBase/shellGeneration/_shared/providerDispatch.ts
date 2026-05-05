export type ShellGenerationRuntimeGuard = {
  allowed?: boolean;
  accepted?: boolean;
  reason?: string;
};

export type ShellGenerationProviderDispatchDecision =
  | {
      ok: true;
    }
  | {
      ok: false;
      code: "GOVERNANCE_REJECTED";
      message: string;
    };

export function isShellGenerationRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function shellGenerationDryRunEnabled(context: unknown): boolean {
  return !isShellGenerationRecord(context) || context.dryRun !== false;
}

export function evaluateShellGenerationProviderDispatch(context: unknown): ShellGenerationProviderDispatchDecision {
  if (shellGenerationDryRunEnabled(context)) {
    return { ok: true };
  }

  const runtimeContext = isShellGenerationRecord(context) ? context : {};
  const guard = runtimeContext.guard;

  if (!isShellGenerationRecord(guard)) {
    return {
      ok: false,
      code: "GOVERNANCE_REJECTED",
      message: "Provider-backed shell generation requires an affirmative runtime guard",
    };
  }

  if (guard.allowed === true || guard.accepted === true) {
    return { ok: true };
  }

  return {
    ok: false,
    code: "GOVERNANCE_REJECTED",
    message:
      typeof guard.reason === "string" && guard.reason.trim().length > 0
        ? guard.reason.trim()
        : "Provider-backed shell generation was rejected by runtime governance",
  };
}
