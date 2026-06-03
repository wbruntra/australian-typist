import { test, expect } from "bun:test";
import {
  type State,
  LINE_WIDTH,
  getStateAt,
  makeInitialState,
  precompute,
  step,
  tokenizeNumber,
  getPriorDelays,
  getBreakDelay,
  getTicksAtLineStart,
  getTotalTicks,
} from "./engine";

// Reconstruct the state at targetTicks by stepping from the start (ground truth)
function stateBySteppingTicks(targetTicks: number, data: any): State {
  const totalTicks = getTotalTicks(data);
  const clampedTicks = Math.min(targetTicks, totalTicks);

  // Find which line we are on using the mathematical formulas
  let low = 0;
  let high = data.lineOffsets.length - 1;
  let lineIndex = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (getTicksAtLineStart(mid, data.lineOffsets) <= clampedTicks) {
      lineIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  // Are we in the pause before lineIndex + 1?
  const nextLineIndex = lineIndex + 1;
  if (nextLineIndex < data.lineOffsets.length) {
    const ticksAtNextStart = getTicksAtLineStart(nextLineIndex, data.lineOffsets);
    const breakDelay = getBreakDelay(lineIndex);
    const pauseStartTick = ticksAtNextStart - breakDelay + 1;

    if (clampedTicks >= pauseStartTick) {
      // Return start of next line with empty currentLine
      const s = makeInitialState();
      let completedLines = 0;
      while (completedLines < nextLineIndex) {
        const { completedLine } = step(s);
        if (completedLine !== null) completedLines++;
      }
      s.currentLine = "";
      return s;
    }
  }

  // Actively typing on lineIndex
  const ticksAtStart = getTicksAtLineStart(lineIndex, data.lineOffsets);
  const charsInLine = clampedTicks - ticksAtStart;
  const s = makeInitialState();
  let completedLines = 0;
  while (completedLines < lineIndex) {
    const { completedLine } = step(s);
    if (completedLine !== null) completedLines++;
  }
  while (s.currentLine.length < charsInLine) {
    step(s);
  }
  return s;
}

function comparable(s: State) {
  return {
    globalLineIndex: s.globalLineIndex,
    currentLine: s.currentLine,
    currentNumber: s.currentNumber,
    tokenIndex: s.tokenIndex,
    charInToken: s.charInToken,
    phase: s.phase,
  };
}

test("tokenizeNumber splits hyphens and appends a trailing comma", () => {
  expect(tokenizeNumber(1)).toEqual(["one,"]);
  expect(tokenizeNumber(47)).toEqual(["forty-", "seven,"]);
  // The maximum is the only number without a trailing comma.
  expect(tokenizeNumber(1_000_000)).toEqual(["one", "million"]);
});

test("no completed line ever exceeds LINE_WIDTH", () => {
  const data = precompute(undefined, 200);
  for (const line of data.allLines) {
    expect(line.length).toBeLessThanOrEqual(LINE_WIDTH);
  }
});

test("lineOffsets are strictly increasing and match line lengths", () => {
  const data = precompute(undefined, 200);
  for (let i = 1; i < data.lineOffsets.length; i++) {
    const delta = data.lineOffsets[i]! - data.lineOffsets[i - 1]!;
    expect(delta).toBe(data.allLines[i - 1]!.length);
  }
});

test("getStateAt reconstructs the stepped state at sampled tick offsets", () => {
  const data = precompute(undefined, 200);
  const totalTicks = getTotalTicks(data);

  // Spot-check at every line boundary, during pauses, and mid-line positions.
  const targets = new Set<number>();
  targets.add(0);
  for (let i = 0; i < data.lineOffsets.length; i++) {
    const ticksAtStart = getTicksAtLineStart(i, data.lineOffsets);
    const lineLen = data.allLines[i]?.length || 0;
    
    // Start of typing on line i
    targets.add(ticksAtStart);
    // Mid line
    targets.add(ticksAtStart + Math.floor(lineLen / 2));
    // End of line typing
    targets.add(ticksAtStart + lineLen);

    // Pause ticks before next line
    if (i + 1 < data.lineOffsets.length) {
      const ticksAtNextStart = getTicksAtLineStart(i + 1, data.lineOffsets);
      const delay = getBreakDelay(i);
      for (let d = 1; d <= delay; d++) {
        targets.add(ticksAtNextStart - d);
      }
    }
  }
  targets.add(totalTicks);

  for (const target of targets) {
    expect(comparable(getStateAt(target, data))).toEqual(comparable(stateBySteppingTicks(target, data)));
  }
});

test("getStateAt rebuilds the full text of a completed line", () => {
  const data = precompute(undefined, 200);
  const lineIndex = 10;
  const ticksAtStart = getTicksAtLineStart(lineIndex, data.lineOffsets);
  const lineLen = data.allLines[lineIndex]!.length;
  // Stepping to the last character of the line should reproduce its full text.
  const s = getStateAt(ticksAtStart + lineLen, data);
  expect(s.currentLine).toBe(data.allLines[lineIndex]!);
});
