import assert from "node:assert/strict";
import test from "node:test";

import {
  DISABLE_TERMINAL_MOUSE_REPORTING,
  ENABLE_TERMINAL_MOUSE_REPORTING,
  enableTerminalMouseReporting,
  isTerminalMouseInput,
  parseMouseScrollDelta,
  parseTerminalMouseEvents,
  shouldEnableTerminalMouseReporting,
} from "./mouse.js";

test("mouse scroll parser accepts SGR reports with or without ESC prefix", () => {
  assert.equal(parseMouseScrollDelta("\u001B[<64;20;5M"), 3);
  assert.equal(parseMouseScrollDelta("[<65;20;5M"), -3);
  assert.equal(parseMouseScrollDelta("<64;20;5M<64;20;5M"), 6);
  assert.equal(parseMouseScrollDelta("plain text"), null);
});

test("mouse parser normalizes SGR click events", () => {
  assert.deepEqual(parseTerminalMouseEvents("\u001B[<0;12;9M"), [{
    kind: "click",
    button: "left",
    pressed: true,
    x: 12,
    y: 9,
    rawCode: 0,
  }]);
  assert.deepEqual(parseTerminalMouseEvents("[<2;14;10m"), [{
    kind: "click",
    button: "right",
    pressed: false,
    x: 14,
    y: 10,
    rawCode: 2,
  }]);
});

test("mouse parser preserves coordinates for mixed scroll and click batches", () => {
  assert.deepEqual(parseTerminalMouseEvents("\u001B[<64;20;5M\u001B[<0;3;7M"), [{
    kind: "scroll",
    delta: 3,
    x: 20,
    y: 5,
    rawCode: 64,
  }, {
    kind: "click",
    button: "left",
    pressed: true,
    x: 3,
    y: 7,
    rawCode: 0,
  }]);
});

test("mouse input detector filters complete SGR mouse reports", () => {
  assert.equal(isTerminalMouseInput("\u001B[<0;12;9M"), true);
  assert.equal(isTerminalMouseInput("[<0;12;9M"), true);
  assert.equal(isTerminalMouseInput("hello[<0;12;9M"), false);
  assert.equal(isTerminalMouseInput("plain text"), false);
});

test("terminal mouse reporting is enabled by default so touchpad wheel scrolling reaches the TUI", () => {
  assert.equal(shouldEnableTerminalMouseReporting({}), true);
  assert.equal(shouldEnableTerminalMouseReporting({ RAXODE_ENABLE_MOUSE: "1" }), true);
  assert.equal(shouldEnableTerminalMouseReporting({ RAXODE_ENABLE_MOUSE: "0" }), false);
});

test("terminal mouse reporting writes enable and cleanup sequences for tty outputs", () => {
  const previous = process.env.RAXODE_ENABLE_MOUSE;
  process.env.RAXODE_ENABLE_MOUSE = "1";
  const writes: string[] = [];
  try {
    const cleanup = enableTerminalMouseReporting({
      isTTY: true,
      write: (chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      },
    });
    cleanup();
  } finally {
    if (previous === undefined) {
      delete process.env.RAXODE_ENABLE_MOUSE;
    } else {
      process.env.RAXODE_ENABLE_MOUSE = previous;
    }
  }
  assert.deepEqual(writes, [
    ENABLE_TERMINAL_MOUSE_REPORTING,
    DISABLE_TERMINAL_MOUSE_REPORTING,
  ]);
});

test("terminal mouse reporting does not write sequences for non-tty outputs", () => {
  const writes: string[] = [];
  const cleanup = enableTerminalMouseReporting({
    isTTY: false,
    write: (chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    },
  });
  cleanup();
  assert.deepEqual(writes, []);
});
