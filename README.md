# planty-wiki: a lightweight note-taking app that runs entirely in the browser

planty-wiki keeps every editing flow inside the browser, so you can write and browse without a native app or a server.

demo page: <https://oshikiri.github.io/planty-wiki/#/pages/index>

- Built with TypeScript, Preact, Lexical, and SQLite on OPFS
- Browse and edit notes in the browser
- Persists notes in an OPFS-backed SQLite and exports Markdown on demand
- Supports Markdown syntax and wiki links such as `[[Page Name]]`, plus backlinks

## Known issues
- Requires Chrome with crossOriginIsolated enabled
- Lacks multi-tab support
  - cf. [How we sped up Notion in the browser with WASM SQLite](https://www.notion.com/blog/how-we-sped-up-notion-in-the-browser-with-wasm-sqlite)
- Lacks proper error handling for OPFS persistence failures

## Launch Locally

```sh
npm clean-install
npm run dev
```

## SQLite WASM
sqlite3 WebAssembly & JavaScript Documentation Index https://sqlite.org/wasm/doc/trunk/index.md

## How I Count Lines of Code

```sh
git ls-files -- 'public/sqlite-opfs-worker.js' '*.ts' '*.tsx' ':!'*.test.ts |\
  xargs cloc

# 3607
```
