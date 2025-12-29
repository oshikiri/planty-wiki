# planty-wiki: a lightweight note-taking app that runs entirely in the browser

planty-wiki keeps every editing flow inside the browser, so you can write and browse without installing native apps.

- Under 4000 lines of TypeScript/worker code
- Built with TypeScript, Preact, Lexical, and SQLite on OPFS
- Lets you read and edit notes directly in the browser UI
- Persists notes in an OPFS-backed SQLite and exports Markdown on demand
- Supports Markdown syntax and wiki links such as `[[Page Name]]`, plus backlinks

## Launch Locally

```sh
npm clean-install
npm run dev
```

## SQLite WASM
sqlite3 WebAssembly & JavaScript Documentation Index https://sqlite.org/wasm/doc/trunk/index.md

## Known issues
- Requires Chrome with crossOriginIsolated enabled
- Lacks multi-tab support
- Contains Japanese comments
- Lacks proper error handling for OPFS persistence failures

## How I Count Lines of Code

```sh
git ls-files -- 'public/sqlite-opfs-worker.js' '*.ts' '*.tsx' ':!'*.test.ts |\
  xargs cloc
```
