# Markdown Supported in planty-wiki

## Headings and Titles

- Use `#`–`######` for headings.
- Example: `# Project Overview` or `## Tasks for Today`.

## Paragraphs and Line Breaks

- Add a blank line to separate paragraphs.

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
- Wrap a page path in `[[...]]`, such as `[[pages/foo]]`, to create a wiki link.
- Wiki links appear emphasized in the text, and clicking them takes you to the linked page.
- Notes that link to the current page (backlinks) are grouped in the Backlinks list at the bottom of the editor.


## Unsupported Syntax

- The image embed syntax (`![alt text](url "title")`) is shown as plain text and does not render.
- Some extended syntax such as tables and footnotes is not supported at this time.
- When you change Lexical or navigation settings, update this list as well.
