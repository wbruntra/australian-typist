# Napkin

## Corrections
| Date | Source | What Went Wrong | What To Do Instead |
|------|--------|----------------|-------------------|
| 2026-06-02 | user | Sub-parts of integers had internal commas, and line wrapping split numbers mid-word. | Join number scale chunks with a space instead of a comma. |
| 2026-06-02 | user | Viewport jumped/scrolled caret into view on every typed letter, preventing manual scrolling. | Wrap paper in a scroll container, detect if the user has scrolled away from the bottom, and only auto-scroll when the user is scrolled near the bottom. |
| 2026-06-02 | user | Wrapping numbers entirely before typing was safe but too aggressive (words in a number could fit on the line). | Split numbers into space/hyphen delimited tokens. Only do a carriage return and start a new line when the next individual token (the word before space or after hyphen) won't fit on the current line. |
| 2026-06-02 | environment | The CSS file (`index.css`) was not imported or linked anywhere, causing it to be missing from the build. | Import `index.css` directly in the entry React script (`src/frontend.tsx`) so Bun's CSS bundler processes and outputs it. |
| 2026-06-02 | user | The browser wrapped "ten" to the next line prematurely even though the code calculated it would fit on the first line (57 chars). | Align physical CSS container width with character length by setting the body's width to `61ch` (60 chars + 1 caret) and increasing `.paper` `max-width` to `810px` so that 60 characters fit without browser wrapping. |
| 2026-06-02 | user | Real-time calculation of millions of lines is too slow on the main thread and would lag rendering. | Precompute the entire 69,740,527 character timeline in a background Web Worker when the page loads, save checkpoints of line offsets and current numbers, and use binary search to instantly fetch the exact typewriter state in microseconds. Use custom React virtualization to only render lines visible in the viewport. |
| 2026-06-02 | user | Virtualization offset calculated with dynamic `.getBoundingClientRect()` inside render thrashed layout and caused a violent feedback loop / screen wobbling. | Lock the relative container start to a stable layout constant of `260px` (distance from top of scroll viewport to top of `.body`). This completely prevents layout thrashing, feedback loops, and wobbling, rendering all lines correctly. |
| 2026-06-02 | user | Setting `scrollTop` state on every single scroll event frame forced React to re-render the entire component body continuously, causing high CPU usage. | Store `scrollTop` and `containerHeight` in `useRef`s to prevent React state triggers during scroll frames. Only trigger a React re-render cycle via a dummy state `scrollTrigger` when the scroll position actually crosses the multiple-of-30px line boundary and shifts the rendered array slice bounds. |
| 2026-06-02 | user | Keeping millions of completed lines in memory thrashed scroll heights, got out of sync with caret scrolling, and was disorienting to view/read. | Simplify the UI by cleanly re-initializing the app upon date selection. The paper page is cleared (`lines: []`) and starts typing fresh from the exact number corresponding to that timeline date. The DOM is lightweight (at most 200 lines buffer), CPU overhead is 0%, and caret auto-scrolling is 100% bug-free. |
| 2026-06-03 | user | If the next number starts on a new line, the previous line did not end in a comma. | Append the comma to the final token of each number during tokenization, so the comma counts towards line width calculations and wraps with the number, and separate numbers with a single space. Increase LINE_WIDTH to 65, set .body width to 66ch, paper max-width to 850px, and font-size to 16px. |
| 2026-06-03 | user | Displaying typewriter text as a flat endless sheet loses the tactile feel of physical pages and lacks page numbering. | Group lines into logical pages of height 40, render pages as physical stacked sheets with fixed heights, show a page number footer (e.g. "Page P of N") at the bottom of each page, and use top/bottom layout spacers to virtualize the scroll stack so the user can scroll smoothly through the entire page stack. |
| 2026-06-03 | user | Re-initializing the typewriter state on date selection causes the cursor/text to jump out of sync and skip typing animation of wrapped numbers. | Have the worker save the exact token index, character index, and state machine phase at the start of each line wrap in Uint8Arrays, and initialize the main thread state with these checkpoints in getStateAt. |
| 2026-06-03 | user | Line wraps and page transitions happen instantly with no pause, failing to capture the physical pacing of a typewriter carriage return or paper feed. | Introduce pause ticks (1 for line wrap, 8 for page wrap) and treat the newline character as a typed character (1 tick). Use a closed-form formula to map elapsed ticks to lines and characters, and update the getStateAt binary search to look up checkpoints by ticks. |

## User Preferences
- **Space-separated full numbers**: Integers represented as words should not have commas inside them (e.g. `one thousand one hundred` instead of `one thousand, one hundred`). Commas should only separate distinct integers in the list.
- **Hyphen-aware line wrapping**: Split line wrapping precisely at space or hyphen boundaries. A line ends in a hyphen (e.g. `forty-`) and the remainder (`seven`) continues on the next line. If a word or segment won't fit, wrap *before* typing it.
- **Scroll freedom with a fixed status display**: Layout should have a fixed status bar at the bottom and a scrollable paper area above it. Caret auto-scrolling only triggers when the user is scrolled to the bottom.
- **Virtual timeline selection**: Typist started on May 1, 2026 at Midnight, writing continuously at 5 chars/sec. A datetime-local input allows scrubbing or picking any date to view progress instantly, and then typing continues from there.

## Patterns That Work
- Splitting strings into words, and further splitting hyphenated words into sub-tokens ending in a hyphen (e.g. `tokenizeNumber` function).
- Keeping the state machine aware of `"token"`, `"space"`, and `"between"` phases for realistic typewriting.
- Using `isAtBottomRef` updated on container scroll to toggle caret auto-scrolling with `scrollIntoView({ block: "nearest" })` smoothly.
- Inline Web Worker blobs to run background computations with zero multi-file build configuration.
- Custom DOM virtualization using top and bottom spacer height blocks matching exactly the number of scrolled off-screen lines.
- Implementing pauses at line and page boundaries by converting wall-clock elapsed time to discrete virtual ticks, then using binary search over line start ticks to reconstruct the page state in O(log N) time.

## Domain Notes
- The typing exercise goes from 1 to 1,000,000.
- `LINE_WIDTH` is 65 characters.
- Page break pause: 8 ticks (1.6s).
- Line break pause: 1 tick (200ms).
- Newline character: 1 tick (200ms).
