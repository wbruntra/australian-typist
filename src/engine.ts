import { numberToWords } from "./numberToWords";

// ---------------------------------------------------------------------------
// The typewriter engine.
//
// A single source of truth for the line-wrapping / number-typing state machine.
// It is consumed in three places, all through `step()`:
//   - the live typing loop in the UI (one step per tick),
//   - `precompute()` in the worker (steps to the end, recording per-line
//     checkpoints), and
//   - `getStateAt()` (replays within a single line to reconstruct an exact
//     state for any character offset).
//
// Keeping the wrapping rules in exactly one function is what prevents the three
// copies from drifting apart.
// ---------------------------------------------------------------------------

export const LINE_WIDTH = 65;
export const MAX_NUMBER = 1_000_000;

export type Phase = "token" | "space" | "between";

export interface State {
  /** Absolute index of the line the caret is currently on. */
  globalLineIndex: number;
  /** Text typed so far on the current line. */
  currentLine: string;
  /** The number currently being written out. */
  currentNumber: number;
  /** Tokens (word fragments) of `currentNumber`; hyphenated words are split. */
  tokens: string[];
  tokenIndex: number;
  charInToken: number;
  phase: Phase;
}

export interface StepResult {
  /** True once the entire 1..MAX_NUMBER sequence has been typed. */
  done: boolean;
  /**
   * When this step finished (wrapped) a line, the full text of that completed
   * line; otherwise null. Used by `precompute()` to collect `allLines`.
   */
  completedLine: string | null;
}

/** Precomputed timeline produced by the worker and indexed by `getStateAt`. */
export interface PrecomputedData {
  /** Full text of every completed line, in order. */
  allLines: string[];
  /** Cumulative character offset at the start of each line. */
  lineOffsets: Uint32Array;
  /** The number being written at the start of each line. */
  currentNumbers: Uint32Array;
  /** Engine checkpoint state at the start of each line. */
  tokenIndexes: Uint8Array;
  charInTokens: Uint8Array;
  phases: Uint8Array;
  /** Total characters in the whole timeline. */
  totalChars: number;
}

const NOT_DONE: StepResult = { done: false, completedLine: null };

function phaseToNum(p: Phase): number {
  return p === "token" ? 0 : p === "space" ? 1 : 2;
}

function numToPhase(n: number): Phase {
  return n === 0 ? "token" : n === 1 ? "space" : "between";
}

export function tokenizeNumber(n: number): string[] {
  const words = numberToWords(n).split(" ");
  const tokens: string[] = [];
  for (const word of words) {
    if (word.includes("-")) {
      const parts = word.split("-");
      for (let i = 0; i < parts.length; i++) {
        tokens.push(i < parts.length - 1 ? parts[i]! + "-" : parts[i]!);
      }
    } else {
      tokens.push(word);
    }
  }
  // Numbers below the maximum are separated from the next by a comma that
  // travels with (and wraps with) the final token.
  if (n < MAX_NUMBER && tokens.length > 0) {
    tokens[tokens.length - 1] += ",";
  }
  return tokens;
}

export function makeInitialState(): State {
  return {
    globalLineIndex: 0,
    currentLine: "",
    currentNumber: 1,
    tokens: tokenizeNumber(1),
    tokenIndex: 0,
    charInToken: 0,
    phase: "token",
  };
}

/**
 * Advance the typewriter by one atomic action: either type a single character,
 * or perform a phase/line transition. Mutates `s` in place.
 */
export function step(s: State): StepResult {
  if (s.phase === "token") {
    const token = s.tokens[s.tokenIndex]!;

    // Still typing characters of the current token.
    if (s.charInToken < token.length) {
      s.currentLine += token[s.charInToken];
      s.charInToken++;
      return NOT_DONE;
    }

    // Token finished. Decide what comes next.
    if (s.tokenIndex < s.tokens.length - 1) {
      const nextToken = s.tokens[s.tokenIndex + 1]!;

      if (token.endsWith("-")) {
        // Hyphenated continuation: no space before the next fragment.
        if ((s.currentLine + nextToken).length > LINE_WIDTH) {
          const completed = s.currentLine;
          s.globalLineIndex++;
          s.currentLine = "";
          s.tokenIndex++;
          s.charInToken = 0;
          return { done: false, completedLine: completed };
        }
        s.tokenIndex++;
        s.charInToken = 0;
        return NOT_DONE;
      }

      // Next fragment is preceded by a space.
      if ((s.currentLine + " " + nextToken).length > LINE_WIDTH) {
        const completed = s.currentLine;
        s.globalLineIndex++;
        s.currentLine = "";
        s.tokenIndex++;
        s.charInToken = 0;
        return { done: false, completedLine: completed };
      }
      s.phase = "space";
      return NOT_DONE;
    }

    // Last token of this number is done; move to the next number.
    const nextNum = s.currentNumber + 1;
    if (nextNum > MAX_NUMBER) {
      const completed = s.currentLine;
      s.globalLineIndex++;
      s.currentLine = "";
      return { done: true, completedLine: completed };
    }

    const nextFirstToken = tokenizeNumber(nextNum)[0]!;
    if ((s.currentLine + " " + nextFirstToken).length > LINE_WIDTH) {
      const completed = s.currentLine;
      s.globalLineIndex++;
      s.currentLine = "";
      s.currentNumber = nextNum;
      s.tokens = tokenizeNumber(nextNum);
      s.tokenIndex = 0;
      s.charInToken = 0;
      return { done: false, completedLine: completed };
    }
    s.phase = "between";
    return NOT_DONE;
  }

  if (s.phase === "space") {
    s.currentLine += " ";
    s.tokenIndex++;
    s.charInToken = 0;
    s.phase = "token";
    return NOT_DONE;
  }

  // phase === "between": the separating space between two numbers.
  s.currentLine += " ";
  const nextNum = s.currentNumber + 1;
  if (nextNum > MAX_NUMBER) {
    return { done: true, completedLine: null };
  }
  s.currentNumber = nextNum;
  s.tokens = tokenizeNumber(nextNum);
  s.tokenIndex = 0;
  s.charInToken = 0;
  s.phase = "token";
  return NOT_DONE;
}

/**
 * A resumable walk over the whole timeline. It collects every line plus a
 * checkpoint of the engine state at the start of each line, so any character
 * offset can later be reconstructed in O(log n) by `getStateAt`.
 *
 * Because the full run is ~60M steps (a few seconds), it is exposed as a
 * stepper rather than a single blocking call: the UI drives `runSlice()` in
 * chunks so the loader stays responsive. `precompute()` below is the
 * run-to-completion convenience used by tests.
 */
export class Precomputer {
  private readonly maxNumber: number;
  private readonly allLines: string[] = [];
  private readonly lineOffsets: number[] = [0];
  private readonly currentNumbers: number[] = [1];
  private readonly tokenIndexes: number[] = [0];
  private readonly charInTokens: number[] = [0];
  private readonly phases: number[] = [0];
  private readonly s = makeInitialState();
  private totalChars = 0;

  done = false;

  constructor(maxNumber: number = MAX_NUMBER) {
    this.maxNumber = maxNumber;
  }

  /** Integer 0..100 indicating how far the walk has progressed. */
  get percent(): number {
    return Math.floor((this.s.currentNumber / this.maxNumber) * 100);
  }

  /**
   * Advance up to `maxSteps` engine steps. Returns true once the whole timeline
   * has been processed.
   */
  runSlice(maxSteps: number): boolean {
    const { s } = this;
    let steps = 0;
    while (steps < maxSteps) {
      const { done, completedLine } = step(s);
      steps++;

      if (completedLine !== null) {
        this.allLines.push(completedLine);
        this.totalChars += completedLine.length;
        // `s` now holds the start-of-next-line checkpoint. Skip it once we've
        // run past a custom ceiling (the partial line is intentionally dropped).
        if (!done && s.currentNumber <= this.maxNumber) {
          this.lineOffsets.push(this.totalChars);
          this.currentNumbers.push(s.currentNumber);
          this.tokenIndexes.push(s.tokenIndex);
          this.charInTokens.push(s.charInToken);
          this.phases.push(phaseToNum(s.phase));
        }
      }

      // The full run stops via `done`; a smaller test ceiling stops here.
      if (done || s.currentNumber > this.maxNumber) {
        this.done = true;
        break;
      }
    }
    return this.done;
  }

  result(): PrecomputedData {
    return {
      allLines: this.allLines,
      lineOffsets: new Uint32Array(this.lineOffsets),
      currentNumbers: new Uint32Array(this.currentNumbers),
      tokenIndexes: new Uint8Array(this.tokenIndexes),
      charInTokens: new Uint8Array(this.charInTokens),
      phases: new Uint8Array(this.phases),
      totalChars: this.totalChars,
    };
  }
}

/** Run the entire precomputation to completion in one blocking call. */
export function precompute(
  onProgress?: (percent: number) => void,
  maxNumber: number = MAX_NUMBER,
): PrecomputedData {
  const pc = new Precomputer(maxNumber);
  let lastPercent = -1;
  while (!pc.runSlice(1_000_000)) {
    if (onProgress && pc.percent !== lastPercent) {
      lastPercent = pc.percent;
      onProgress(pc.percent);
    }
  }
  return pc.result();
}

/**
 * Reconstruct the exact engine state after `targetChars` characters have been
 * typed. Binary-searches the line checkpoints, then replays `step()` within
 * that single line up to the requested offset.
 */
export function getStateAt(targetChars: number, data: PrecomputedData): State {
  const { lineOffsets, currentNumbers, tokenIndexes, charInTokens, phases } = data;

  let low = 0;
  let high = lineOffsets.length - 1;
  let lineIndex = 0;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (lineOffsets[mid]! <= targetChars) {
      lineIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const charsInLine = targetChars - lineOffsets[lineIndex]!;
  const num = currentNumbers[lineIndex]!;

  const s: State = {
    globalLineIndex: lineIndex,
    currentLine: "",
    currentNumber: num,
    tokens: tokenizeNumber(num),
    tokenIndex: tokenIndexes[lineIndex]!,
    charInToken: charInTokens[lineIndex]!,
    phase: numToPhase(phases[lineIndex]!),
  };

  // The target is always strictly inside this line, so no wrap occurs here.
  while (s.currentLine.length < charsInLine) {
    step(s);
  }

  return s;
}
