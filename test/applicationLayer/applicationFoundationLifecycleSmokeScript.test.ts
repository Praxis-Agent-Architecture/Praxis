import assert from "node:assert/strict";
import test from "node:test";

import {
  runApplicationFoundationLifecycleSmoke,
} from "../../examples/scripts/runtime_application_foundation_lifecycle_smoke.js";

test("application foundation lifecycle smoke closes mounted session facts", async () => {
  const result = await runApplicationFoundationLifecycleSmoke({
    now: () => "2026-06-08T00:00:00.000Z",
  });

  assert.equal(result.status, "ok");
  assert.equal(result.view.startStatus, "ready");
  assert.equal(result.view.createStatus, "ready");
  assert.equal(result.view.renameStatus, "ready");
  assert.equal(result.view.closeStatus, "closed");
  assert.equal(result.view.resumeStatus, "ready");
  assert.equal(result.view.autoResumeStatus, "ready");
  assert.equal(result.view.autoResumeSessionId, "session.application.foundation-lifecycle-smoke.auto");
  assert.equal(result.view.createLocked, true);
  assert.equal(result.view.closeLocked, false);
  assert.equal(result.foundation.sessionPresent, true);
  assert.equal(result.foundation.startedStatus, "idle");
  assert.equal(result.foundation.startSource, "application.start");
  assert.equal(result.foundation.closedStatus, "closed");
  assert.equal(result.foundation.resumedStatus, "idle");
  assert.equal(result.foundation.sessionStatus, "idle");
  assert.equal(result.foundation.autoResumeStatus, "idle");
  assert.equal(result.foundation.createdTitle, "Foundation lifecycle smoke");
  assert.equal(result.foundation.renamedTitle, "Foundation lifecycle smoke renamed");
  assert.equal(result.foundation.externalTitle, "Foundation lifecycle smoke external");
  assert.equal(result.foundation.sessionTitle, "Foundation lifecycle smoke external");
  assert.equal(result.foundation.autoResumeTitle, "Foundation lifecycle smoke auto");
  assert.equal(result.foundation.lockedAfterClose, false);
  assert.equal(result.sessionReport.status, "ok");
  assert.equal(result.sessionReport.applicationCommandKind, "praxis.application.sessionReport");
  assert.equal(result.sessionReport.publicSafe, true);
  assert.equal(result.sessionReport.applicationSessionId, "session.application.foundation-lifecycle-smoke");
  assert.equal(result.sessionReport.sourceKind, "foundation-memory");
  assert.equal(result.sessionReport.hasSession, true);
  assert.equal(result.sessionReport.hasProject, true);
  assert.equal(result.sessionReport.hasForkRelation, false);
  assert.equal(result.sessionReport.sessionStatus, "idle");
  assert.equal(result.sessionReport.sessionTitle, "Foundation lifecycle smoke external");
  assert.equal(result.sessionReport.projectSessions >= 2, true);
  assert.equal(result.sessionReport.activeLeases, 0);
  assert.equal(result.sessionReport.allBindingsBelongToSession, true);
});
