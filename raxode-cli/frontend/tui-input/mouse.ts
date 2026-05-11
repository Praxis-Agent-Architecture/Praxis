/*
 * 文件定位：raxode-cli / frontend terminal mouse input helpers。
 * 核心目的：迁移 legacy TUI 的 SGR 鼠标解析，供新前端 panels/list 复用。
 */

export type RaxodeTerminalMouseEvent =
  | {
      kind: "scroll";
      delta: number;
      x: number;
      y: number;
      rawCode: number;
    }
  | {
      kind: "click";
      button: "left" | "middle" | "right";
      pressed: boolean;
      x: number;
      y: number;
      rawCode: number;
    };

const sgrMousePattern = /(?:\u001B)?\[?<(\d+);(\d+);(\d+)([mM])/gu;
const singleSgrMousePattern = /^(?:\u001B)?\[?<\d+;\d+;\d+[mM]$/u;
export const ENABLE_TERMINAL_MOUSE_REPORTING = "\u001B[?1000h\u001B[?1006h";
export const DISABLE_TERMINAL_MOUSE_REPORTING = "\u001B[?1000l\u001B[?1006l";

export function shouldEnableTerminalMouseReporting(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RAXODE_ENABLE_MOUSE === "1";
}

export function enableTerminalMouseReporting(output: Pick<NodeJS.WriteStream, "isTTY" | "write">): () => void {
  if (!output.isTTY || !shouldEnableTerminalMouseReporting()) {
    return () => {};
  }
  output.write(ENABLE_TERMINAL_MOUSE_REPORTING);
  return () => {
    output.write(DISABLE_TERMINAL_MOUSE_REPORTING);
  };
}

function buttonForCode(code: number): "left" | "middle" | "right" | undefined {
  const buttonCode = code & 3;
  if (buttonCode === 0) return "left";
  if (buttonCode === 1) return "middle";
  if (buttonCode === 2) return "right";
  return undefined;
}

export function parseTerminalMouseEvents(inputText: string): readonly RaxodeTerminalMouseEvent[] {
  const events: RaxodeTerminalMouseEvent[] = [];
  for (const match of inputText.matchAll(sgrMousePattern)) {
    const code = Number(match[1]);
    const x = Number(match[2]);
    const y = Number(match[3]);
    const marker = match[4];
    if (!Number.isFinite(code) || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (code === 64 || code === 65) {
      events.push({
        kind: "scroll",
        delta: code === 64 ? 3 : -3,
        x,
        y,
        rawCode: code,
      });
      continue;
    }
    const button = buttonForCode(code);
    if (!button) continue;
    events.push({
      kind: "click",
      button,
      pressed: marker === "M",
      x,
      y,
      rawCode: code,
    });
  }
  return events;
}

export function parseMouseScrollDelta(inputText: string): number | null {
  let delta = 0;
  let found = false;
  for (const event of parseTerminalMouseEvents(inputText)) {
    if (event.kind !== "scroll") continue;
    found = true;
    delta += event.delta;
  }
  return found ? delta : null;
}

export function isTerminalMouseInput(inputText: string): boolean {
  return singleSgrMousePattern.test(inputText);
}
