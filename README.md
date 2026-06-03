# One to One Million — A Typographical Exercise

A real-time digital typewriter that types every number from 1 to 1,000,000 written out as English words — one character at a time, one every 200ms, starting from May 1, 2026.

```
one, two, three, four, five, …
one hundred and forty-seven thousand eight hundred and ninety-nine, …
one million.
```

## How it works

- **Real-time typing** — a state machine drives a vintage-style typewriter, typing characters at a steady 200ms interval. Hyphenated words wrap to the next line with a trailing hyphen, exactly like a physical typewriter.
- **Precomputed timeline** — a Web Worker generates the full ~70 million character sequence on load, storing checkpoint arrays for every line. This makes instant seeking possible.
- **Virtualized pages** — the output is grouped into pages of 40 lines each, with only 3 pages rendered at any time. Top and bottom spacer divs simulate full scroll height without DOM overhead.
- **Seek anywhere** — use the datetime-local picker in the status bar to jump to any point between May 1 and October 9, 2026. A binary search through the checkpoint arrays finds the exact state in microseconds.
- **Vintage aesthetic** — paper-textured pages, a blinking red caret, Courier Prime typewriter font, and a wooden desk background — styled with Tailwind CSS v4 and custom CSS.
- **Server-rendered SPA** — Bun serves the React app via HTML imports with automatic bundling and HMR in development.

## Tech

[Bun](https://bun.sh) · [React 19](https://react.dev) · [TypeScript](https://www.typescriptlang.org) · [Tailwind CSS v4](https://tailwindcss.com) · Web Workers

## Run

```bash
bun install
bun dev        # http://localhost:3000 with HMR
```

## Build

```bash
bun run build
bun start      # production server on port 3000
```

## Test

```bash
bun test
```
