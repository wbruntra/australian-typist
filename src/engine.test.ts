import { test, expect } from "bun:test";
import {
  type State,
  LINE_WIDTH,
  getStateAt,
  makeInitialState,
  precompute,
  step,
  tokenizeNumber,
} from "./engine";

// Step from the very beginning until exactly `target` characters have been
// typed, returning the partial-line state. This is the ground truth that the
// precompute + binary-search `getStateAt` pipeline must reproduce.
function stateByStepping(target: number): State {
  const s = makeInitialState();
  let completedChars = 0;
  while (completedChars + s.currentLine.length < target) {
    const { completedLine } = step(s);
    if (completedLine !== null) completedChars += completedLine.length;
  }
  // At an exact line boundary, `getStateAt` represents the position as the
  // START of the next line (the wrap has happened). Consume that one pending
  // wrap so both conventions agree. A peek on a clone keeps `s` untouched.
  if (step({ ...s }).completedLine !== null) {
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

test("getStateAt reconstructs the stepped state at sampled offsets", () => {
  const data = precompute(undefined, 200);
  // Spot-check at every line boundary and a handful of mid-line positions.
  const targets = new Set<number>();
  for (let i = 0; i < data.lineOffsets.length; i++) {
    const start = data.lineOffsets[i]!;
    const end = i + 1 < data.lineOffsets.length ? data.lineOffsets[i + 1]! : data.totalChars;
    targets.add(start);
    targets.add(Math.floor((start + end) / 2));
    targets.add(Math.max(start, end - 1));
  }
  for (const target of targets) {
    expect(comparable(getStateAt(target, data))).toEqual(comparable(stateByStepping(target)));
  }
});

test("getStateAt rebuilds the full text of a completed line", () => {
  const data = precompute(undefined, 200);
  const lineIndex = 10;
  const start = data.lineOffsets[lineIndex]!;
  const end = data.lineOffsets[lineIndex + 1]!;
  // Stepping to the last character of the line should reproduce its full text.
  const s = getStateAt(end - 1, data);
  expect(s.currentLine).toBe(data.allLines[lineIndex]!.slice(0, end - 1 - start));
});
