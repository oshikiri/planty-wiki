# planty-wiki

planty-wiki is a lightweight, local-first note-taking app that runs in the browser.
Notes are saved locally and can sync across authorized devices through ChatGPT Sites.

- Built with TypeScript, Preact, Lexical, and SQLite on OPFS
- Browse and edit notes in the browser
- Persists notes in an OPFS-backed SQLite database
- Syncs notes across authorized devices when signed in to ChatGPT Sites
- Imports and exports Markdown folders
- Works offline after the app has loaded; Cloud Sync requires a network connection
- Supports Markdown syntax and wiki links such as `[[Page Name]]`, plus backlinks

## Known issues
- Multiple tabs are not supported
- Local notes remain tied to the browser profile. Clearing browser storage or deleting the profile removes them; use Cloud Sync or export Markdown folders to keep another copy.
- Image embeds are not supported

## Launch Locally

```sh
npm clean-install
npm run dev
```

## Publish with ChatGPT Sites

The production build uses `/` as its default base path, which is suitable for a ChatGPT Site.
The publish checklist is described in this section.

In ChatGPT, attach this repository to a Sites request such as:

```text
@Sites Deploy this project as a website. Check compatibility, save a version for review, and wait for my confirmation before publishing it publicly.
```
