import { useEffect, useRef, useState } from "react";
import {
  type PrecomputedData,
  type State,
  Precomputer,
  getStateAt,
  makeInitialState,
} from "./engine";

const TYPE_INTERVAL_MS = 200;
// Default virtual start date: May 1 2026 00:00
const DEFAULT_START_TIME = new Date(2026, 4, 1, 0, 0, 0).getTime();

// Page geometry. These pixel heights mirror the rendered `.paper` sizes in
// index.css (the first page is taller because of its header) and are used to
// drive scroll virtualization. Keep them in sync with the stylesheet.
const LINES_PER_PAGE = 40;
const FIRST_PAGE_PX = 1598;
const PAGE_PX = 1398;

function formatVirtualDate(ms: number): string {
  return new Date(ms).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/** Clamp elapsed ms to [0, completion]. */
function clampElapsed(elapsedMs: number, totalChars: number): number {
  return Math.min(Math.max(0, elapsedMs), totalChars * TYPE_INTERVAL_MS);
}

function jumpToChars(
  targetChars: number,
  data: PrecomputedData,
  setState: (s: State) => void,
  setRenderedRange: (r: { start: number; end: number }) => void,
) {
  const s = getStateAt(targetChars, data);
  const pageIdx = Math.floor(s.globalLineIndex / LINES_PER_PAGE);
  setRenderedRange({ start: Math.max(0, pageIdx - 2), end: pageIdx });
  setState(s);
}

export function App() {
  const [precomputedData, setPrecomputedData] = useState<PrecomputedData | null>(null);
  const [loadingProgress, setLoadingProgress] = useState(0);

  const [state, setState] = useState<State>(makeInitialState);
  const [paused, setPaused] = useState(false);
  const [renderedRange, setRenderedRange] = useState({ start: 0, end: 0 });

  // The virtual start date: "the typist began on this date". Never mutated
  // by pause/resume — only by the user's start-date input or restart.
  const [startTime, setStartTime] = useState(DEFAULT_START_TIME);

  // Total committed paused duration from previous pauses (ms).
  // Split into a ref (always current, used for computation) and state (used
  // for display, updated on resume so it triggers a re-render).
  const totalPausedMsRef = useRef(0);
  const [totalPausedMsDisplay, setTotalPausedMsDisplay] = useState(0);

  // Wall-clock timestamp when the current pause began; null if running.
  const pauseStartWallMsRef = useRef<number | null>(null);

  const stateRef = useRef(state);
  stateRef.current = state;
  const caretRef = useRef<HTMLSpanElement>(null);
  const paperContainerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);

  // Return the active elapsed ms (wall elapsed minus all paused time), capped
  // at completion. Safe to call any time regardless of pause state.
  const getElapsedMs = (totalChars: number): number => {
    const wallElapsed = Date.now() - startTime;
    const currentPause = pauseStartWallMsRef.current !== null
      ? Date.now() - pauseStartWallMsRef.current
      : 0;
    return clampElapsed(wallElapsed - totalPausedMsRef.current - currentPause, totalChars);
  };

  // ----- precomputation -------------------------------------------------------

  useEffect(() => {
    let cancelled = false;
    const pc = new Precomputer();
    const SLICE_STEPS = 250_000;

    const runChunk = () => {
      if (cancelled) return;
      const finished = pc.runSlice(SLICE_STEPS);
      setLoadingProgress(pc.percent);
      if (finished) {
        onPrecomputeDone(pc.result());
      } else {
        setTimeout(runChunk, 0);
      }
    };

    const onPrecomputeDone = (data: PrecomputedData) => {
      setPrecomputedData(data);
      // Fast-forward to "now" using the default start date.
      const elapsedMs = clampElapsed(Date.now() - DEFAULT_START_TIME, data.totalChars);
      const targetChars = Math.floor(elapsedMs / TYPE_INTERVAL_MS);
      jumpToChars(targetChars, data, setState, setRenderedRange);
    };

    runChunk();
    return () => { cancelled = true; };
  }, []);

  // ----- clock-based tick -----------------------------------------------------

  // State is a pure function of the clock: no drift accumulation possible.
  useEffect(() => {
    if (!precomputedData || paused) return;
    const id = setInterval(() => {
      const targetChars = Math.floor(getElapsedMs(precomputedData.totalChars) / TYPE_INTERVAL_MS);
      setState(getStateAt(targetChars, precomputedData));
    }, TYPE_INTERVAL_MS);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, precomputedData, startTime]);

  // When startTime changes (user edits the start-date input), re-derive state
  // immediately even if paused.
  useEffect(() => {
    if (!precomputedData) return;
    const elapsedMs = getElapsedMs(precomputedData.totalChars);
    const targetChars = Math.floor(elapsedMs / TYPE_INTERVAL_MS);
    jumpToChars(targetChars, precomputedData, setState, setRenderedRange);
    isAtBottomRef.current = true;
    setTimeout(() => {
      const el = paperContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startTime, precomputedData]);

  // ----- scroll handler -------------------------------------------------------

  const handleScroll = () => {
    const el = paperContainerRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;

    const scrollTop = el.scrollTop;
    const viewportHeight = el.clientHeight;
    const getPageIndexAtY = (y: number) =>
      y < FIRST_PAGE_PX ? 0 : 1 + Math.floor((y - FIRST_PAGE_PX) / PAGE_PX);

    const currentPageIndex = Math.floor(stateRef.current.globalLineIndex / LINES_PER_PAGE);
    const start = Math.max(0, getPageIndexAtY(scrollTop - PAGE_PX));
    const end = Math.min(currentPageIndex, getPageIndexAtY(scrollTop + viewportHeight + PAGE_PX));

    setRenderedRange((prev) =>
      prev.start === start && prev.end === end ? prev : { start, end }
    );
  };

  // ----- caret follow ---------------------------------------------------------

  useEffect(() => {
    if (!isAtBottomRef.current) return;
    const currentPageIdx = Math.floor(state.globalLineIndex / LINES_PER_PAGE);
    setRenderedRange((prev) => {
      if (currentPageIdx > prev.end) {
        return { start: Math.max(0, currentPageIdx - 2), end: currentPageIdx };
      }
      return prev;
    });
    caretRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [state.currentLine, state.globalLineIndex]);

  // ----- controls -------------------------------------------------------------

  const togglePause = () => {
    if (!paused) {
      // Record when this pause began.
      pauseStartWallMsRef.current = Date.now();
    } else {
      // Commit the duration of this pause and clear the timer.
      const duration = Date.now() - pauseStartWallMsRef.current!;
      totalPausedMsRef.current += duration;
      setTotalPausedMsDisplay(totalPausedMsRef.current);
      pauseStartWallMsRef.current = null;
    }
    setPaused((p) => !p);
  };

  const handleStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!precomputedData || !e.target.value) return;
    setStartTime(new Date(e.target.value).getTime());
  };

  // Set the start date to right now, so elapsed = 0 and typing resumes from
  // the very beginning of the manuscript.
  const handleSetStartToNow = () => {
    if (!paused) {
      pauseStartWallMsRef.current = null;
    }
    totalPausedMsRef.current = 0;
    setTotalPausedMsDisplay(0);
    setStartTime(Date.now());
  };

  // ----- render ---------------------------------------------------------------

  if (!precomputedData) {
    return (
      <div className="loader-overlay">
        <div className="loader-box">
          <h2 className="loader-title">Australian Typist</h2>
          <div className="loader-bar-bg">
            <div className="loader-bar-fill" style={{ width: `${loadingProgress}%` }} />
          </div>
          <div className="loader-progress">
            Preparing Parchment & Ink... {loadingProgress}%
          </div>
        </div>
      </div>
    );
  }

  const currentElapsedMs = getElapsedMs(precomputedData.totalChars);
  const currentPageIndex = Math.floor(state.globalLineIndex / LINES_PER_PAGE);
  const startIdx = Math.min(renderedRange.start, currentPageIndex);
  const endIdx = Math.min(renderedRange.end, currentPageIndex);
  const renderedPages: number[] = [];
  for (let p = startIdx; p <= endIdx; p++) renderedPages.push(p);
  const topSpacerHeight = startIdx === 0 ? 0 : FIRST_PAGE_PX + (startIdx - 1) * PAGE_PX;
  const bottomSpacerHeight = (currentPageIndex - endIdx) * PAGE_PX;
  const totalCharsTyped =
    (precomputedData.lineOffsets[state.globalLineIndex] || 0) + state.currentLine.length;
  const done = totalCharsTyped >= precomputedData.totalChars;
  const startDateInputValue = new Date(startTime).toISOString().slice(0, 16);

  return (
    <div className="scene">
      <div className="paper-container" ref={paperContainerRef} onScroll={handleScroll}>
        <div className="paper-stack">
          {topSpacerHeight > 0 && <div style={{ height: `${topSpacerHeight}px`, width: "100%" }} />}
          {renderedPages.map((pageIdx) => {
            const pageLines = [];
            for (let k = 0; k < LINES_PER_PAGE; k++) {
              const globalIdx = pageIdx * LINES_PER_PAGE + k;
              if (globalIdx < state.globalLineIndex) {
                pageLines.push({ text: precomputedData.allLines[globalIdx], isCurrent: false });
              } else if (globalIdx === state.globalLineIndex) {
                pageLines.push({ text: state.currentLine, isCurrent: true });
              } else {
                pageLines.push({ text: "", isCurrent: false });
              }
            }

            return (
              <div className={`paper${pageIdx === 0 ? " first-page" : ""}`} key={pageIdx}>
                {pageIdx === 0 && (
                  <header className="paper-header">
                    <p className="kicker">A typographical exercise</p>
                    <h1 className="title">One to One Million</h1>
                    <p className="subtitle">in which every number is written out in full</p>
                    <hr className="rule" />
                    <p className="colophon">typed at one character every {TYPE_INTERVAL_MS} milliseconds</p>
                  </header>
                )}

                <div className="body">
                  {pageLines.map((lineObj, idx) =>
                    lineObj.isCurrent ? (
                      <div className="line current" key={idx}>
                        {lineObj.text}
                        <span className="caret" ref={caretRef} />
                      </div>
                    ) : (
                      <div className="line" key={idx}>
                        {lineObj.text || " "}
                      </div>
                    )
                  )}
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
            <span className="status-label">started</span>
            <input
              type="datetime-local"
              className="datetime-input"
              value={startDateInputValue}
              onChange={handleStartDateChange}
            />
            <button className="btn ghost now-btn" onClick={handleSetStartToNow}>now</button>
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
            <span className="status-label">as of</span>
            <span className="status-value">
              {formatVirtualDate(startTime + currentElapsedMs)}
            </span>
          </span>
          {totalPausedMsDisplay > 0 && (
            <>
              <span className="status-sep">·</span>
              <span className="status-item">
                <span className="status-label">break</span>
                <span className="status-value">{formatDuration(totalPausedMsDisplay)}</span>
              </span>
            </>
          )}
          <span className="status-spacer" />
          {!done && (
            <button className="btn" onClick={togglePause}>
              {paused ? "resume" : "pause"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
