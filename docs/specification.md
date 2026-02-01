# Functional Requirements

## Overview

- Tech stack: TypeScript + Preact + Vite + Lexical + SQLite WASM on OPFS.
- Use English for UI labels, placeholders, status messages, and notifications shown to users.
- Display and routing:
  - Route with `/pages/[URL-encoded markdown file name]`.
  - Create an empty page when routing to a missing page so users can start writing.
  - Open the SQL query page at `/tools/query` and display SELECT or WITH results in a table.

## Runtime Environment

- Supported browser: Chrome>=142.
  - Treat other browsers as unverified.
- Do not support incognito or guest mode because data disappears on browser exit.
- Use a single browser because automatic sync across browsers is not possible.
- Serve over HTTPS or localhost to enable OPFS.

## Storage and Sync

- Validate and insert import or bulk-save input records one by one.
  - Fail the entire transaction when an invalid record is found so invalid data never enters the DB.
- Show a confirmation dialog or an undo bar in delete UIs so data is not removed immediately by mistake.
- Keep a failed diff instead of discarding it so it can be saved again after recovery.
- Store data in SQLite WASM as an intermediate table and read and write there in normal operations.
- Provide a feature that imports Markdown from a user-selected local directory.
- Clear the existing SQLite database and overwrite it with the imported content when importing from a Markdown folder.
- Auto-save and apply changes to SQLite when input pauses for a few seconds during editing.
- Run Markdown export only when the Export button is pressed, and do not run it during normal auto-save.
- Ignore the file side on conflicts after import and overwrite with the DB by re-exporting.

## Markdown

- Support wiki links in the `[[Page]]` format, emphasize them in the body, and open the page on click.
- Do not support image embed syntax (`![alt](url)`), and store it as plain text.
  - Keep accepting `![...]` as a literal string for now, although image embeds may be supported later.
- Avoid custom Markdown extensions to maximize portability.

## Distribution

- Use static hosting on GitHub Pages.
- Load Markdown under `docs/` at first launch when no saved notes exist, and show it as `/pages/...`.
- Place official SQLite WASM artifacts directly under `/public/sqlite3.{js,wasm}` and distribute them with `sqlite-opfs-worker.js` and `sqlite3-opfs-async-proxy.js`.
- Do not support images or attachments at this time.
- Do not provide full-app installation or offline cache.

## Known Limitations

- Do not automate DB schema migrations, so schema changes may lose data.
- Save data locally per browser profile and do not sync to servers or clouds, so multi-device sync is unsupported.
- Lose notes when browser storage is cleared or a profile is deleted.
- Assume a Chrome crossOriginIsolated environment for SQLite/OPFS storage and fall back to memory-only mode without persistence when requirements are not met.
- Do not guarantee behavior when editing from multiple tabs.
