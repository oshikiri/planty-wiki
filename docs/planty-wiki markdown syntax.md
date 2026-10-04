# Markdown Supported in planty-wiki

## Headings and Titles

- Use `#`–`######` for headings.
- Example: `# Project Overview` or `## Tasks for Today`.

## Paragraphs and Line Breaks

- Add a blank line to separate paragraphs.
- On screens up to 480px wide, editor text uses a 14px font instead of 16px. For example, `A short note.` appears smaller on a phone.

## Lists and Checkboxes

- Start a line with `- `, `* `, or `+ ` to create a bulleted list.
- Use `1. ` to create a numbered list.
- Indent by 4 spaces to create nested lists.
- Use `- [ ] Task` to create an unchecked checklist item.
- Use `- [x] Completed task` to create a checked checklist item.

## Emphasis and Inline Code

- Use `*text*` or `_text_` for italics. *text*
- Use `**text**` or `__text__` for bold emphasis. **text**
- Use `~~text~~` to apply strikethrough. ~~text~~
- Use \`code\` to show inline code. `code`

## Code Blocks

- Wrap the code in three backticks to create a code block.
- Example:

```ts
const message = "hello";
console.log(message);
```

## Blockquotes

- Start a line with `> ` to create a blockquote.
    - >Example: `> This feature works offline` when quoting the spec.

## Links and Wiki Links

- Use `[text](https://example.com)` for an external link.
    - Example: [Home](https://example.com/)
- Plain URLs that start with http/https such as `https://example.com` become links automatically.
- They open in your browser when clicked.
    - Example: Paste `https://developer.chrome.com/` as is and open it in your browser.
- Wrap a page name in `[[...]]`, such as `[[foo]]`, to create a wiki link.
- Wiki links appear emphasized in the text, and clicking them takes you to the linked page.
- Notes that link to the current page (backlinks) are grouped in the Backlinks list at the bottom of the editor.


## Note Navigation

- The sidebar shows all notes, with the most recently updated note first.
- For example, saving an edit to `[[Project]]` moves that note to the top of the list.

## Cloud Sync Conflicts

- Choose `Keep local` to keep the latest saved local version, or `Use server` to replace it with the server version.
- Resolution becomes available after local changes finish saving. Editing pauses while the chosen version is loaded.
- For a path conflict, enter another path, such as `/pages/project-local`, and choose `Save at new path`.
- Existing wiki links keep their original target. For example, change `[[project]]` to `[[project-local]]` to link to a renamed local note.
- Choose `Discard local` and confirm to remove the conflicting local note.
- During Markdown import, `Cancel Import` stops file reading before notes are saved. Once `Saving Import...` appears, saving runs to completion.

## Bundled Documentation Pages

- Bundled documentation pages can be edited like other notes. For example, open `[[README]]` and add a paragraph.
- Your saved edits remain when the bundled source for that page has not changed.
- Loading a newly built and deployed app replaces the saved body of each page whose bundled source changed, including your edits. Changes to other bundled pages do not replace your edits to this page.
- Existing documentation pages without a recorded source hash receive the current bundled body once when this feature is first used.
- Deleted pages are not restored by the update check. Opening a missing bundled page explicitly, such as `[[README]]`, creates it from the bundled body.

## Unsupported Syntax

- The image embed syntax (`![alt text](url "title")`) is shown as plain text and does not render.
- Some extended syntax such as tables and footnotes is not supported at this time.
- When you change Lexical or navigation settings, update this list as well.
- Avoid custom Markdown extensions to maximize portability.
