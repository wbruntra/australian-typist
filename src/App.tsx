import { useEffect, useRef, useState } from "react";
import { numberToWords } from "./numberToWords";

const TYPE_INTERVAL_MS = 200;
const LINE_WIDTH = 65;
const MAX_VISIBLE_LINES = 200;

type Phase = "token" | "space" | "between";

type State = {
  globalLineIndex: number;
  currentLine: string;
  currentNumber: number;
  tokens: string[];
  tokenIndex: number;
  charInToken: number;
  phase: Phase;
  sepIndex: number;
};

function tokenizeNumber(n: number): string[] {
  const words = numberToWords(n).split(" ");
  const tokens: string[] = [];
  for (const word of words) {
    if (word.includes("-")) {
      const parts = word.split("-");
      for (let i = 0; i < parts.length; i++) {
        if (i < parts.length - 1) {
          tokens.push(parts[i] + "-");
        } else {
          tokens.push(parts[i]);
        }
      }
    } else {
      tokens.push(word);
    }
  }
  if (n < 1000000 && tokens.length > 0) {
    tokens[tokens.length - 1] += ",";
  }
  return tokens;
}

function makeInitialState(): State {
  return {
    globalLineIndex: 0,
    currentLine: "",
    currentNumber: 1,
    tokens: tokenizeNumber(1),
    tokenIndex: 0,
    charInToken: 0,
    phase: "token",
    sepIndex: 0,
  };
}

function tick(s: State): { done: boolean } {
  if (s.phase === "token") {
    const token = s.tokens[s.tokenIndex]!;
    if (s.charInToken < token.length) {
      s.currentLine += token[s.charInToken];
      s.charInToken++;
      return { done: false };
    }
    
    if (s.tokenIndex < s.tokens.length - 1) {
      const nextToken = s.tokens[s.tokenIndex + 1]!;
      const currentToken = s.tokens[s.tokenIndex]!;
      
      if (currentToken.endsWith("-")) {
        const tentative = s.currentLine + nextToken;
        if (tentative.length > LINE_WIDTH) {
          s.globalLineIndex++;
          s.currentLine = "";
        }
        s.tokenIndex++;
        s.charInToken = 0;
        s.phase = "token";
        return { done: false };
      } else {
        const tentative = s.currentLine + " " + nextToken;
        if (tentative.length > LINE_WIDTH) {
          s.globalLineIndex++;
          s.currentLine = "";
          s.tokenIndex++;
          s.charInToken = 0;
          s.phase = "token";
          return { done: false };
        } else {
          s.phase = "space";
          return { done: false };
        }
      }
    }
    
    const nextNum = s.currentNumber + 1;
    if (nextNum > 1_000_000) {
      s.globalLineIndex++;
      s.currentLine = "";
      return { done: true };
    }
    
    const nextFirstToken = tokenizeNumber(nextNum)[0]!;
    const tentative = s.currentLine + " " + nextFirstToken;
    if (tentative.length > LINE_WIDTH) {
      s.globalLineIndex++;
      s.currentLine = "";
      s.currentNumber = nextNum;
      s.tokens = tokenizeNumber(nextNum);
      s.tokenIndex = 0;
      s.charInToken = 0;
      s.phase = "token";
      return { done: false };
    } else {
      s.phase = "between";
      s.sepIndex = 0;
      return { done: false };
    }
  }

  if (s.phase === "space") {
    s.currentLine += " ";
    s.tokenIndex++;
    s.charInToken = 0;
    s.phase = "token";
    return { done: false };
  }

  if (s.phase === "between") {
    s.currentLine += " ";
    
    const nextNum = s.currentNumber + 1;
    if (nextNum > 1_000_000) {
      return { done: true };
    }
    s.currentNumber = nextNum;
    s.tokens = tokenizeNumber(nextNum);
    s.tokenIndex = 0;
    s.charInToken = 0;
    s.phase = "token";
    return { done: false };
  }

  return { done: true };
}

// Inlined Web Worker code string
const WORKER_CODE = `
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const scales = ["", "thousand", "million"];

  function belowHundred(n) {
    if (n < 20) return ones[n] || "";
    const ten = Math.floor(n / 10);
    const one = n % 10;
    if (one === 0) return tens[ten] || "";
    return tens[ten] + "-" + ones[one];
  }

  function belowThousand(n) {
    if (n < 100) return belowHundred(n);
    const hundred = Math.floor(n / 100);
    const remainder = n % 100;
    if (remainder === 0) return ones[hundred] + " hundred";
    return ones[hundred] + " hundred and " + belowHundred(remainder);
  }

  function numberToWords(n) {
    if (n === 0) return "zero";
    if (n < 0) return "minus " + numberToWords(-n);
    const chunks = [];
    let scaleIndex = 0;
    let remaining = n;
    while (remaining > 0) {
      const chunk = remaining % 1000;
      if (chunk !== 0) {
        let part = belowThousand(chunk);
        if (scaleIndex > 0) {
          part += " " + scales[scaleIndex];
        }
        chunks.unshift(part);
      }
      remaining = Math.floor(remaining / 1000);
      scaleIndex++;
    }
    return chunks.join(" ");
  }

  function tokenizeNumber(n) {
    const words = numberToWords(n).split(" ");
    const tokens = [];
    for (const word of words) {
      if (word.includes("-")) {
        const parts = word.split("-");
        for (let i = 0; i < parts.length; i++) {
          if (i < parts.length - 1) {
            tokens.push(parts[i] + "-");
          } else {
            tokens.push(parts[i]);
          }
        }
      } else {
        tokens.push(word);
      }
    }
    if (n < 1000000 && tokens.length > 0) {
      tokens[tokens.length - 1] += ",";
    }
    return tokens;
  }

  self.onmessage = function(e) {
    const LINE_WIDTH = 65;
    const allLines = [];
    const lineOffsets = [];
    const currentNumbers = [];
    const tokenIndexes = [];
    const charInTokens = [];
    const phases = [];
    
    let currentLine = "";
    let currentNumber = 1;
    let tokens = tokenizeNumber(1);
    let tokenIndex = 0;
    let charInToken = 0;
    let phase = "token";
    let sepIndex = 0;
    let totalChars = 0;
    
    lineOffsets.push(0);
    currentNumbers.push(1);
    tokenIndexes.push(0);
    charInTokens.push(0);
    phases.push(0);
    
    while (currentNumber <= 1000000) {
      if (phase === "token") {
        const token = tokens[tokenIndex];
        const remainingTokenChars = token.length - charInToken;
        currentLine += token.substring(charInToken);
        totalChars += remainingTokenChars;
        
        if (tokenIndex < tokens.length - 1) {
          const nextToken = tokens[tokenIndex + 1];
          const currentToken = tokens[tokenIndex];
          
          if (currentToken.endsWith("-")) {
            const tentative = currentLine + nextToken;
            if (tentative.length > LINE_WIDTH) {
              allLines.push(currentLine);
              lineOffsets.push(totalChars);
              currentLine = "";
              currentNumbers.push(currentNumber);
              tokenIndexes.push(tokenIndex + 1);
              charInTokens.push(0);
              phases.push(0);
            }
            tokenIndex++;
            charInToken = 0;
            phase = "token";
          } else {
            const tentative = currentLine + " " + nextToken;
            if (tentative.length > LINE_WIDTH) {
              allLines.push(currentLine);
              lineOffsets.push(totalChars);
              currentLine = "";
              currentNumbers.push(currentNumber);
              tokenIndexes.push(tokenIndex + 1);
              charInTokens.push(0);
              phases.push(0);
              tokenIndex++;
              charInToken = 0;
              phase = "token";
            } else {
              phase = "space";
            }
          }
        } else {
          const nextNum = currentNumber + 1;
          if (nextNum > 1000000) {
            allLines.push(currentLine);
            lineOffsets.push(totalChars);
            currentLine = "";
            currentNumbers.push(currentNumber);
            tokenIndexes.push(tokenIndex);
            charInTokens.push(charInToken);
            phases.push(phase === "token" ? 0 : phase === "space" ? 1 : 2);
            break;
          }
          
          const nextFirstToken = tokenizeNumber(nextNum)[0];
          const tentative = currentLine + " " + nextFirstToken;
          if (tentative.length > LINE_WIDTH) {
            allLines.push(currentLine);
            lineOffsets.push(totalChars);
            currentLine = "";
            currentNumber = nextNum;
            tokens = tokenizeNumber(nextNum);
            tokenIndex = 0;
            charInToken = 0;
            phase = "token";
            currentNumbers.push(currentNumber);
            tokenIndexes.push(0);
            charInTokens.push(0);
            phases.push(0);
          } else {
            phase = "between";
            sepIndex = 0;
          }
        }
      } else if (phase === "space") {
        currentLine += " ";
        totalChars++;
        tokenIndex++;
        charInToken = 0;
        phase = "token";
      } else if (phase === "between") {
        currentLine += " ";
        totalChars++;
        const nextNum = currentNumber + 1;
        currentNumber = nextNum;
        tokens = tokenizeNumber(nextNum);
        tokenIndex = 0;
        charInToken = 0;
        phase = "token";
        
        if (currentNumber % 10000 === 0) {
          self.postMessage({ type: "progress", progress: currentNumber / 10000 });
        }
      }
    }
    
    const lineOffsetsArray = new Uint32Array(lineOffsets);
    const currentNumbersArray = new Uint32Array(currentNumbers);
    const tokenIndexesArray = new Uint8Array(tokenIndexes);
    const charInTokensArray = new Uint8Array(charInTokens);
    const phasesArray = new Uint8Array(phases);
    
    self.postMessage({
      type: "done",
      allLines: allLines,
      lineOffsets: lineOffsetsArray,
      currentNumbers: currentNumbersArray,
      tokenIndexes: tokenIndexesArray,
      charInTokens: charInTokensArray,
      phases: phasesArray,
      totalChars: totalChars
    });
  };
`;

const START_DATE_TIME = new Date(2026, 4, 1, 0, 0, 0).getTime();

function formatHMS(seconds: number): string {
  const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function formatVirtualDate(seconds: number): string {
  const date = new Date(START_DATE_TIME + seconds * 1000);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getStateAt(targetChars: number, data: any): State {
  const { allLines, lineOffsets, currentNumbers, tokenIndexes, charInTokens, phases } = data;
  if (!lineOffsets || !currentNumbers || !allLines) {
    console.error("getStateAt: missing data keys! data =", {
      hasAllLines: !!allLines,
      hasLineOffsets: !!lineOffsets,
      hasCurrentNumbers: !!currentNumbers
    });
  }
  let low = 0;
  let high = (lineOffsets?.length || 1) - 1;
  let lineIndex = 0;
  
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineOffsets[mid] <= targetChars) {
      lineIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  
  const completedLines = allLines ? allLines.slice(0, lineIndex) : [];
  const lineFullText = (allLines && allLines[lineIndex]) || "";
  const charsInCurrentLine = targetChars - (lineOffsets ? lineOffsets[lineIndex] : 0);
  
  const startNum = currentNumbers ? currentNumbers[lineIndex] : 1;
  if (isNaN(startNum) || startNum === undefined) {
    console.error("getStateAt: startNum is NaN or undefined! lineIndex =", lineIndex, "targetChars =", targetChars, "currentNumbers =", currentNumbers);
  }
  
  const startTokenIndex = tokenIndexes ? tokenIndexes[lineIndex] : 0;
  const startCharInToken = charInTokens ? charInTokens[lineIndex] : 0;
  const startPhaseVal = phases ? phases[lineIndex] : 0;
  const startPhase: Phase = startPhaseVal === 0 ? "token" : startPhaseVal === 1 ? "space" : "between";

  const s: State = {
    globalLineIndex: lineIndex,
    currentLine: "",
    currentNumber: startNum || 1,
    tokens: tokenizeNumber(startNum || 1),
    tokenIndex: startTokenIndex || 0,
    charInToken: startCharInToken || 0,
    phase: startPhase,
    sepIndex: 0,
  };
  
  let lineChars = 0;
  while (lineChars < charsInCurrentLine) {
    if (s.phase === "token") {
      const token = s.tokens[s.tokenIndex]!;
      const remainingTokenChars = token.length - s.charInToken;
      const steps = Math.min(charsInCurrentLine - lineChars, remainingTokenChars);
      
      s.currentLine += token.substring(s.charInToken, s.charInToken + steps);
      s.charInToken += steps;
      lineChars += steps;
      
      if (s.charInToken === token.length) {
        if (s.tokenIndex < s.tokens.length - 1) {
          const nextToken = s.tokens[s.tokenIndex + 1]!;
          const currentToken = s.tokens[s.tokenIndex]!;
          
          if (currentToken.endsWith("-")) {
            const tentative = s.currentLine + nextToken;
            if (tentative.length > LINE_WIDTH) {
              s.lines.push(s.currentLine);
              s.currentLine = "";
            }
            s.tokenIndex++;
            s.charInToken = 0;
            s.phase = "token";
          } else {
            const tentative = s.currentLine + " " + nextToken;
            if (tentative.length > LINE_WIDTH) {
              s.lines.push(s.currentLine);
              s.currentLine = "";
              s.tokenIndex++;
              s.charInToken = 0;
              s.phase = "token";
            } else {
              s.phase = "space";
            }
          }
        } else {
          const nextNum = s.currentNumber + 1;
          const nextFirstToken = tokenizeNumber(nextNum)[0]!;
          const tentative = s.currentLine + " " + nextFirstToken;
          if (tentative.length > LINE_WIDTH) {
            s.lines.push(s.currentLine);
            s.currentLine = "";
            s.currentNumber = nextNum;
            s.tokens = tokenizeNumber(nextNum);
            s.tokenIndex = 0;
            s.charInToken = 0;
            s.phase = "token";
          } else {
            s.phase = "between";
            s.sepIndex = 0;
          }
        }
      }
    } else if (s.phase === "space") {
      s.currentLine += " ";
      s.tokenIndex++;
      s.charInToken = 0;
      s.phase = "token";
      lineChars++;
    } else if (s.phase === "between") {
      s.currentLine += " ";
      const nextNum = s.currentNumber + 1;
      s.currentNumber = nextNum;
      s.tokens = tokenizeNumber(nextNum);
      s.tokenIndex = 0;
      s.charInToken = 0;
      s.phase = "token";
      lineChars++;
    }
  }
  
  return s;
}

export function App() {
  const [precomputedData, setPrecomputedData] = useState<any>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const [state, setState] = useState<State>(makeInitialState);
  const [paused, setPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  // Date/Time input controller state
  const [dateInputValue, setDateInputValue] = useState("");
  const [renderedRange, setRenderedRange] = useState({ start: 0, end: 0 });

  const maxDateVal = precomputedData && !isNaN(precomputedData.totalChars)
    ? START_DATE_TIME + precomputedData.totalChars * TYPE_INTERVAL_MS
    : null;
  const maxDateStr = maxDateVal && !isNaN(maxDateVal)
    ? new Date(maxDateVal).toISOString().slice(0, 16)
    : "2026-10-09T10:21";

  const stateRef = useRef(state);
  stateRef.current = state;
  const bodyRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);
  const paperContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const accumulatedMsRef = useRef(0);
  const runStartRef = useRef<number | null>(null);

  // Initialize Web Worker for full simulation precomputation
  useEffect(() => {
    const blob = new Blob([WORKER_CODE], { type: "application/javascript" });
    const worker = new Worker(URL.createObjectURL(blob));
    
    worker.onmessage = (e) => {
      if (e.data.type === "progress") {
        setLoadingProgress(e.data.progress);
      } else if (e.data.type === "done") {
        console.log("Worker done. totalChars =", e.data.totalChars, "allLines.length =", e.data.allLines?.length);
        setPrecomputedData({
          allLines: e.data.allLines,
          lineOffsets: e.data.lineOffsets,
          currentNumbers: e.data.currentNumbers,
          tokenIndexes: e.data.tokenIndexes,
          charInTokens: e.data.charInTokens,
          phases: e.data.phases,
          totalChars: e.data.totalChars,
        });
        
        // Fast forward to present day!
        // Start date: 2026-05-01. Capped at typing completion (approx October 9, 2026).
        const now = Date.now();
        console.log("now =", now, "START_DATE_TIME =", START_DATE_TIME, "totalChars =", e.data.totalChars);
        const nowElapsedMs = Math.min(
          now - START_DATE_TIME,
          (e.data.totalChars || 0) * TYPE_INTERVAL_MS
        );
        const startElapsedMs = Math.max(0, nowElapsedMs);
        const targetChars = (Math.floor(startElapsedMs / TYPE_INTERVAL_MS)) || 0;
        console.log("targetChars computed =", targetChars);
        
        // Re-initialize to this timeline location cleanly
        const s = getStateAt(targetChars, e.data);
        const currentPageIdx = Math.floor(s.globalLineIndex / 40);
        setRenderedRange({
          start: Math.max(0, currentPageIdx - 2),
          end: currentPageIdx
        });
        setState(s);
        
        const initialSeconds = targetChars * (TYPE_INTERVAL_MS / 1000);
        setElapsedSeconds(initialSeconds || 0);
        accumulatedMsRef.current = (initialSeconds || 0) * 1000;
        
        // Format for picker input: YYYY-MM-DDTHH:MM
        const pickerDate = new Date(START_DATE_TIME + (initialSeconds || 0) * 1000);
        const formattedDate = !isNaN(pickerDate.getTime()) ? pickerDate.toISOString().slice(0, 16) : "";
        setDateInputValue(formattedDate);
      }
    };
    
    worker.postMessage("start");
    
    return () => {
      worker.terminate();
    };
  }, []);

  const handleScroll = () => {
    const el = paperContainerRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    isAtBottomRef.current = isAtBottom;

    const scrollTop = el.scrollTop;
    const viewportHeight = el.clientHeight;
    
    const getPageIndexAtY = (y: number) => {
      if (y < 1598) return 0;
      return 1 + Math.floor((y - 1598) / 1398);
    };

    const targetCurrentPageIndex = Math.floor(stateRef.current.globalLineIndex / 40);

    const start = Math.max(0, getPageIndexAtY(scrollTop - 1398));
    const end = Math.min(targetCurrentPageIndex, getPageIndexAtY(scrollTop + viewportHeight + 1398));

    setRenderedRange((prev) => {
      if (prev.start === start && prev.end === end) {
        return prev;
      }
      return { start, end };
    });
  };

  useEffect(() => {
    if (!precomputedData) return;
    if (paused) {
      if (runStartRef.current !== null) {
        accumulatedMsRef.current += Date.now() - runStartRef.current;
        runStartRef.current = null;
      }
    } else {
      runStartRef.current = Date.now();
    }
  }, [paused, precomputedData]);

  // Real-time character typing interval
  useEffect(() => {
    if (!precomputedData || paused) return;
    const id = setInterval(() => {
      const current = stateRef.current;
      const next: State = { ...current };
      const { done } = tick(next);
      setState(next);
      if (done) return;
    }, TYPE_INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, precomputedData]);

  // Sync elapsed seconds with real-time ticking
  useEffect(() => {
    if (!precomputedData) return;
    if (runStartRef.current === null) {
      const sec = Math.floor(accumulatedMsRef.current / 1000);
      setElapsedSeconds(sec);
      
      // Update picker input to match current state (only when paused to prevent focus/editing jumps)
      if (paused) {
        const pickerDate = new Date(START_DATE_TIME + sec * 1000);
        setDateInputValue(pickerDate.toISOString().slice(0, 16));
      }
    } else {
      const sec = Math.floor(
        (accumulatedMsRef.current + (Date.now() - runStartRef.current)) / 1000
      );
      setElapsedSeconds(sec);
      
      // Update picker date occasionally while typing
      const pickerDate = new Date(START_DATE_TIME + sec * 1000);
      setDateInputValue(pickerDate.toISOString().slice(0, 16));
    }
  }, [state, precomputedData, paused]);

  // Handle Date/Time picker manual change: Re-initialize App
  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!precomputedData) return;
    const value = e.target.value;
    setDateInputValue(value);
    
    if (!value) return;
    const selectedTime = new Date(value).getTime();
    
    // Calculate elapsed milliseconds and cap at completion
    const maxElapsedMs = precomputedData.totalChars * TYPE_INTERVAL_MS;
    const elapsedMs = Math.min(
      Math.max(0, selectedTime - START_DATE_TIME),
      maxElapsedMs
    );
    
    const targetChars = Math.floor(elapsedMs / TYPE_INTERVAL_MS);
    
    // Clean Re-initialization from the selected timeline location!
    const jumpState = getStateAt(targetChars, precomputedData);
    const currentPageIdx = Math.floor(jumpState.globalLineIndex / 40);
    setRenderedRange({
      start: Math.max(0, currentPageIdx - 2),
      end: currentPageIdx
    });
    setState(jumpState);
    
    const sec = targetChars * (TYPE_INTERVAL_MS / 1000);
    setElapsedSeconds(sec);
    accumulatedMsRef.current = sec * 1000;
    
    if (!paused) {
      runStartRef.current = Date.now();
    }
    
    // Scroll to the bottom of the fresh page
    isAtBottomRef.current = true;
    setTimeout(() => {
      const el = paperContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  };

  useEffect(() => {
    const currentPageIdx = Math.floor(state.globalLineIndex / 40);
    setRenderedRange((prev) => {
      if (currentPageIdx > prev.end) {
        return {
          start: Math.max(0, currentPageIdx - 2),
          end: currentPageIdx
        };
      }
      return prev;
    });

    if (isAtBottomRef.current) {
      caretRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [state.currentLine, state.globalLineIndex]);

  const done = state.currentNumber > 1_000_000 && state.currentLine === "";

  const handleRestart = () => {
    if (!precomputedData) return;
    accumulatedMsRef.current = 0;
    runStartRef.current = paused ? null : Date.now();
    setElapsedSeconds(0);
    setRenderedRange({ start: 0, end: 0 });
    setState(makeInitialState());
    isAtBottomRef.current = true;
    setDateInputValue(new Date(START_DATE_TIME).toISOString().slice(0, 16));
  };

  // If loading, render vintage loading overlay
  if (!precomputedData) {
    return (
      <div className="loader-overlay">
        <div className="loader-box">
          <h2 className="loader-title">Australian Typist</h2>
          <div className="loader-bar-bg">
            <div 
              className="loader-bar-fill" 
              style={{ width: `${loadingProgress}%` }}
            />
          </div>
          <div className="loader-progress">
            Preparing Parchment & Ink... {loadingProgress}%
          </div>
        </div>
      </div>
    );
  }

  const PAGE_HEIGHT = 40;
  const currentPageIndex = !isNaN(state.globalLineIndex) ? Math.floor(state.globalLineIndex / PAGE_HEIGHT) : 0;
  const totalPages = precomputedData && precomputedData.allLines
    ? Math.ceil(precomputedData.allLines.length / PAGE_HEIGHT)
    : 0;

  const startIdx = Math.min(renderedRange.start, currentPageIndex);
  const endIdx = Math.min(renderedRange.end, currentPageIndex);

  const renderedPages = [];
  if (!isNaN(startIdx) && !isNaN(endIdx)) {
    for (let p = startIdx; p <= endIdx; p++) {
      renderedPages.push(p);
    }
  }

  const topSpacerHeight = startIdx === 0 ? 0 : 1598 + (startIdx - 1) * 1398;
  const bottomSpacerHeight = (currentPageIndex - endIdx) * 1398;

  const totalCharsTyped =
    (precomputedData && precomputedData.lineOffsets && state.globalLineIndex !== undefined && !isNaN(state.globalLineIndex))
      ? (precomputedData.lineOffsets[state.globalLineIndex] || 0) + (state.currentLine?.length || 0)
      : 0;

  return (
    <div className="scene">
      <div className="paper-container" ref={paperContainerRef} onScroll={handleScroll}>
        <div className="paper-stack">
          {topSpacerHeight > 0 && <div style={{ height: `${topSpacerHeight}px`, width: "100%" }} />}
          {renderedPages.map((pageIdx) => {
            const pageLines = [];
            for (let k = 0; k < PAGE_HEIGHT; k++) {
              const globalIdx = pageIdx * PAGE_HEIGHT + k;
              if (globalIdx < state.globalLineIndex) {
                pageLines.push({ text: precomputedData.allLines[globalIdx], isCurrent: false });
              } else if (globalIdx === state.globalLineIndex) {
                pageLines.push({ text: state.currentLine, isCurrent: true });
              } else {
                pageLines.push({ text: "", isCurrent: false });
              }
            }

            const isFirst = pageIdx === 0;

            return (
              <div className={`paper${isFirst ? " first-page" : ""}`} key={pageIdx}>
                {isFirst && (
                  <header className="paper-header">
                    <p className="kicker">A typographical exercise</p>
                    <h1 className="title">One to One Million</h1>
                    <p className="subtitle">in which every number is written out in full</p>
                    <hr className="rule" />
                    <p className="colophon">typed at one character every {TYPE_INTERVAL_MS} milliseconds</p>
                  </header>
                )}

                <div className="body" ref={pageIdx === currentPageIndex ? bodyRef : null}>
                  {pageLines.map((lineObj, idx) => {
                    if (lineObj.isCurrent) {
                      return (
                        <div className="line current" key={idx}>
                          {lineObj.text}
                          <span className="caret" ref={caretRef} />
                        </div>
                      );
                    }
                    return (
                      <div className="line" key={idx}>
                        {lineObj.text || "\u00a0"}
                      </div>
                    );
                  })}
                </div>

                <footer className="paper-footer">
                  <span>— {pageIdx + 1} —</span>
                </footer>
              </div>
            );
          })}
          {bottomSpacerHeight > 0 && <div style={{ height: `${bottomSpacerHeight}px`, width: "100%" }} />}
        </div>
      </div>

      <div className="status-container">
        <div className="status">
          <span className="status-item">
            <span className="status-label">timeline</span>
            <input 
              type="datetime-local" 
              className="datetime-input"
              min="2026-05-01T00:00"
              max={maxDateStr}
              value={dateInputValue}
              onChange={handleDateChange}
            />
          </span>
          <span className="status-sep">·</span>
          <span className="status-item">
            <span className="status-label">number</span>
            <span className="status-value">
              {Math.min(state.currentNumber, 1_000_000).toLocaleString()}
            </span>
          </span>
          <span className="status-sep">·</span>
          <span className="status-item">
            <span className="status-label">characters</span>
            <span className="status-value">{totalCharsTyped.toLocaleString()}</span>
          </span>
          <span className="status-sep">·</span>
          <span className="status-item">
            <span className="status-label">virtual date</span>
            <span className="status-value">{formatVirtualDate(elapsedSeconds)}</span>
          </span>
          <span className="status-spacer" />
          {done ? (
            <button className="btn" onClick={handleRestart}>
              begin again
            </button>
          ) : (
            <button className="btn" onClick={() => setPaused((p) => !p)}>
              {paused ? "resume" : "pause"}
            </button>
          )}
          <button className="btn ghost" onClick={handleRestart}>
            restart
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
